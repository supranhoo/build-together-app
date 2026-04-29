
REVOKE EXECUTE ON FUNCTION public.set_test_data_lock(uuid, boolean, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.seed_test_data(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.purge_test_data(uuid, text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.test_data_counts(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_test_data_enabled(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_test_data_lock(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_test_data(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_test_data(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_data_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_test_data_enabled(uuid) TO authenticated;
