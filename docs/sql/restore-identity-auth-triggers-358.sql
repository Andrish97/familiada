CREATE TRIGGER auth_guest_identity_metadata BEFORE INSERT OR UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public._guest_identity_metadata();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER poll_identity_auth_insert AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public._poll_identity_auth_trigger();
CREATE TRIGGER poll_identity_auth_change BEFORE UPDATE OR DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public._poll_identity_auth_trigger();
