-- Remove TinyMCE API key from public_kv — TinyMCE is now self-hosted via jsDelivr (no key needed)
DELETE FROM public_kv WHERE key = 'tinymce_api_key';
