-- Urdu messages to parents. Each parent can get messages in English or Urdu (empty: the school's
-- default, set by the principal on Settings). Every template gets an Urdu version; WhatsApp sends
-- the same approved template in its Urdu translation.

ALTER TABLE guardians ADD COLUMN language ENUM('en','ur') NULL AFTER preferred_channel;

ALTER TABLE school_settings ADD COLUMN message_language ENUM('en','ur') NULL AFTER sibling_discount;

ALTER TABLE message_templates
  ADD COLUMN subject_ur VARCHAR(300) NULL AFTER whatsapp_params,
  ADD COLUMN body_ur TEXT NULL AFTER subject_ur,
  ADD COLUMN sms_body_ur VARCHAR(480) NULL AFTER body_ur;

ALTER TABLE message_deliveries ADD COLUMN template_language VARCHAR(10) NULL AFTER template_params;

UPDATE message_templates SET
  subject_ur = '{{student_names_ur}} کی فیس کی یاد دہانی',
  body_ur = 'محترم {{guardian_name}}،\n\nآپ کو یاد دلایا جاتا ہے کہ {{student_names_ur}} کی {{amount_owed}} فیس ابھی باقی ہے (سب سے پرانی آخری تاریخ: {{oldest_due_date}})۔ براہِ کرم جلد از جلد ادا کر دیں۔ اگر آپ ادائیگی کر چکے ہیں تو اس پیغام کو نظر انداز کر دیں۔\n\nشکریہ،\n{{school_name}}',
  sms_body_ur = '{{school_name}}: {{student_names_ur}} کی {{amount_owed}} فیس باقی ہے (آخری تاریخ {{oldest_due_date}})۔ براہِ کرم جلد ادا کریں۔ ادا کر چکے ہیں تو نظر انداز کریں۔'
WHERE template_key = 'fee_reminder';

UPDATE message_templates SET
  subject_ur = '{{student_names_ur}} کی غیر حاضری',
  body_ur = 'محترم {{guardian_name}}،\n\n{{student_names_ur}} کی اسکول سے غیر حاضری لگی ہے ({{absence_detail_ur}})۔ براہِ کرم اسکول کو وجہ سے آگاہ کریں۔\n\nشکریہ،\n{{school_name}}',
  sms_body_ur = '{{school_name}}: {{student_names_ur}} کی غیر حاضری لگی ہے ({{absence_detail_ur}})۔ براہِ کرم وجہ بتائیں۔'
WHERE template_key = 'absence_alert';

UPDATE message_templates SET
  subject_ur = '{{school_name}} کی طرف سے پیغام',
  body_ur = 'محترم {{guardian_name}}،\n\n{{message}}\n\nشکریہ،\n{{school_name}}',
  sms_body_ur = '{{school_name}}: {{message}}'
WHERE template_key = 'announcement';
