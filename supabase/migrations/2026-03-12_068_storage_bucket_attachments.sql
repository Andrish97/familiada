-- 068: create message-attachments storage bucket

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('message-attachments', 'message-attachments', false, 10485760, NULL)
ON CONFLICT (id) DO NOTHING;
