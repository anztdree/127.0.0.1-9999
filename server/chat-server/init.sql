-- ============================================
-- Chat Server — Tables
-- Database: super_warrior_z
-- Tables: chat_logs
-- ============================================

CREATE TABLE IF NOT EXISTS chat_logs (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    room_id     VARCHAR(64)     NOT NULL,
    user_id     VARCHAR(64)     NOT NULL,
    content     TEXT            NOT NULL,
    kind        INT             DEFAULT 2,
    created_at  TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_room_time (room_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
