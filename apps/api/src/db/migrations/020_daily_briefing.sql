-- A rule that sends its creator a morning briefing on WhatsApp (attendance, fees, online payments to
-- match, approvals waiting), limited to what they may see. It goes to them, so it needs no approval.
ALTER TABLE automations
  MODIFY kind ENUM('fee_reminder','absence_today','absence_streak','daily_briefing') NOT NULL;
