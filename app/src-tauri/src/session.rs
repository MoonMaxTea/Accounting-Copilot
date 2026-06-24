use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::PathBuf;

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::config::{self, ProjectsUiState};

pub(crate) const DRAFT_AGENT_SESSION_KEY: &str = "__draft__";
use crate::models::{
    AiAgentMessage, AiConversationIndexEntry, AiConversationTurn, StoredAiSession,
};

const SESSION_VERSION: u32 = 1;

pub(crate) fn session_file_name(session_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(session_key.as_bytes());
    format!("{:x}.json", hasher.finalize())
}

fn sessions_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| error.to_string())
        .map(|dir| dir.join("sessions"))
}

pub fn session_file_path(app: &AppHandle, session_key: &str) -> Result<PathBuf, String> {
    Ok(sessions_dir(app)?.join(session_file_name(session_key)))
}

pub fn load_session(
    app: &AppHandle,
    key: &str,
) -> Result<(Vec<AiAgentMessage>, Vec<AiConversationTurn>), String> {
    let path = session_file_path(app, key)?;
    if !path.is_file() {
        return Ok((Vec::new(), Vec::new()));
    }
    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let stored: StoredAiSession =
        serde_json::from_str(&raw).map_err(|error| format!("Invalid session file: {error}"))?;
    Ok((stored.messages, stored.activity))
}

pub fn save_session(
    app: &AppHandle,
    key: &str,
    messages: &[AiAgentMessage],
    activity: &[AiConversationTurn],
) -> Result<(), String> {
    let dir = sessions_dir(app)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = dir.join(session_file_name(key));
    if messages.is_empty() && activity.is_empty() {
        if path.is_file() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
        return Ok(());
    }
    let stored = StoredAiSession {
        version: SESSION_VERSION,
        project_relative_path: key.to_string(),
        messages: messages.to_vec(),
        activity: activity.to_vec(),
    };
    let raw = serde_json::to_string_pretty(&stored).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
}

pub fn delete_session(app: &AppHandle, key: &str) -> Result<(), String> {
    let path = session_file_path(app, key)?;
    if path.is_file() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn rename_session(app: &AppHandle, from_key: &str, to_key: &str) -> Result<(), String> {
    if from_key == to_key {
        return Ok(());
    }
    let (messages, activity) = load_session(app, from_key)?;
    if messages.is_empty() && activity.is_empty() {
        delete_session(app, from_key)?;
        return Ok(());
    }
    save_session(app, to_key, &messages, &activity)?;
    delete_session(app, from_key)
}

fn latest_activity_timestamp(activity: &[AiConversationTurn]) -> u64 {
    activity
        .iter()
        .map(|turn| turn.timestamp_secs)
        .max()
        .unwrap_or(0)
}

pub fn list_session_activity_index(
    app: &AppHandle,
) -> Result<Vec<AiConversationIndexEntry>, String> {
    let dir = sessions_dir(app)?;
    if !dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        let stored: StoredAiSession =
            serde_json::from_str(&raw).map_err(|error| format!("Invalid session file: {error}"))?;
        if stored.project_relative_path == DRAFT_AGENT_SESSION_KEY {
            continue;
        }
        entries.push(AiConversationIndexEntry {
            relative_path: stored.project_relative_path,
            latest_timestamp_secs: latest_activity_timestamp(&stored.activity),
        });
    }

    entries.sort_by(|left, right| {
        right
            .latest_timestamp_secs
            .cmp(&left.latest_timestamp_secs)
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });
    Ok(entries)
}

pub fn migrate_config_sessions(app: &AppHandle) -> Result<(), String> {
    let mut config = config::load_config(app)?;
    if config.projects_ui.ai_agent_sessions.is_empty() && config.projects_ui.ai_threads.is_empty() {
        return Ok(());
    }

    let mut keys = BTreeSet::new();
    keys.extend(config.projects_ui.ai_agent_sessions.keys().cloned());
    keys.extend(config.projects_ui.ai_threads.keys().cloned());

    for key in keys {
        let messages = config.projects_ui.agent_session(&key);
        let mut activity = config
            .projects_ui
            .ai_threads
            .get(&key)
            .cloned()
            .unwrap_or_default();
        let (existing_messages, existing_activity) = load_session(app, &key)?;
        let merged_messages = if messages.is_empty() {
            existing_messages
        } else {
            messages
        };
        if !existing_activity.is_empty() {
            activity = merge_activity(existing_activity, activity);
        }
        save_session(app, &key, &merged_messages, &activity)?;
    }

    config.projects_ui.ai_agent_sessions.clear();
    config.projects_ui.ai_threads.clear();
    config::save_config(app, &config)
}

fn merge_activity(
    existing: Vec<AiConversationTurn>,
    incoming: Vec<AiConversationTurn>,
) -> Vec<AiConversationTurn> {
    if existing.is_empty() {
        return incoming;
    }
    if incoming.is_empty() {
        return existing;
    }
    let mut merged = existing;
    for turn in incoming {
        if !merged.iter().any(|item| turns_equal(item, &turn)) {
            merged.push(turn);
        }
    }
    merged
}

pub(crate) fn merge_activity_for_persist(
    existing: Vec<AiConversationTurn>,
    incoming: Vec<AiConversationTurn>,
) -> Vec<AiConversationTurn> {
    merge_activity(existing, incoming)
}

pub(crate) fn turns_equal(left: &AiConversationTurn, right: &AiConversationTurn) -> bool {
    left.role == right.role
        && left.content == right.content
        && left.timestamp_secs == right.timestamp_secs
        && left.kind == right.kind
}

pub fn delete_sessions_with_prefix(app: &AppHandle, folder_relative: &str) -> Result<(), String> {
    let prefix = format!("{folder_relative}/");
    let keys: Vec<String> = list_session_activity_index(app)?
        .into_iter()
        .map(|entry| entry.relative_path)
        .filter(|relative_path| {
            relative_path == folder_relative || relative_path.starts_with(&prefix)
        })
        .collect();
    for key in keys {
        delete_session(app, &key)?;
    }
    delete_session(app, folder_relative)
}

pub fn conversation_index_with_legacy(
    app: &AppHandle,
    projects_ui: &ProjectsUiState,
) -> Result<Vec<AiConversationIndexEntry>, String> {
    let mut by_path: BTreeMap<String, u64> = BTreeMap::new();

    for entry in list_session_activity_index(app)? {
        by_path.insert(entry.relative_path, entry.latest_timestamp_secs);
    }

    for (relative_path, turns) in &projects_ui.ai_threads {
        if relative_path == DRAFT_AGENT_SESSION_KEY || turns.is_empty() {
            continue;
        }
        let latest = latest_activity_timestamp(turns);
        by_path
            .entry(relative_path.clone())
            .and_modify(|value| *value = (*value).max(latest))
            .or_insert(latest);
    }

    let mut entries: Vec<AiConversationIndexEntry> = by_path
        .into_iter()
        .map(|(relative_path, latest_timestamp_secs)| AiConversationIndexEntry {
            relative_path,
            latest_timestamp_secs,
        })
        .collect();
    entries.sort_by(|left, right| {
        right
            .latest_timestamp_secs
            .cmp(&left.latest_timestamp_secs)
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_sessions_dir() -> PathBuf {
        let id = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("accounting-copilot-session-test-{id}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp sessions dir");
        dir
    }

    #[test]
    fn session_file_name_is_stable() {
        assert_eq!(
            session_file_name("合营分析/demo.md"),
            session_file_name("合营分析/demo.md")
        );
        assert_ne!(
            session_file_name("合营分析/demo.md"),
            session_file_name("合营分析/other.md")
        );
    }

    #[test]
    fn save_load_round_trip_writes_expected_schema() {
        let dir = temp_sessions_dir();
        let key = "project/demo.md";
        let path = dir.join(session_file_name(key));
        let stored = StoredAiSession {
            version: SESSION_VERSION,
            project_relative_path: key.to_string(),
            messages: vec![AiAgentMessage {
                role: "user".to_string(),
                content: Some("question".to_string()),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            }],
            activity: vec![AiConversationTurn {
                role: "user".to_string(),
                content: "question".to_string(),
                timestamp_secs: 42,
                kind: "create".to_string(),
            }],
        };
        fs::write(
            &path,
            serde_json::to_string_pretty(&stored).expect("serialize"),
        )
        .expect("write session");

        let raw = fs::read_to_string(path).expect("read session");
        let loaded: StoredAiSession = serde_json::from_str(&raw).expect("parse session");
        assert_eq!(loaded.version, stored.version);
        assert_eq!(loaded.project_relative_path, stored.project_relative_path);
        assert_eq!(loaded.messages.len(), stored.messages.len());
        assert_eq!(loaded.activity, stored.activity);
    }

    #[test]
    fn delete_removes_session_file() {
        let dir = temp_sessions_dir();
        let path = dir.join(session_file_name("to-delete.md"));
        fs::write(&path, "{}").expect("write");
        assert!(path.is_file());
        fs::remove_file(&path).expect("delete");
        assert!(!path.is_file());
    }

    #[test]
    fn merge_activity_deduplicates_identical_turns() {
        let turn = AiConversationTurn {
            role: "user".to_string(),
            content: "q".to_string(),
            timestamp_secs: 1,
            kind: "create".to_string(),
        };
        let merged = merge_activity(vec![turn.clone()], vec![turn]);
        assert_eq!(merged.len(), 1);
    }
}
