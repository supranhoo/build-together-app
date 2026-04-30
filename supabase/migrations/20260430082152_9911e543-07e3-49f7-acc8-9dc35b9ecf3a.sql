REVOKE EXECUTE ON FUNCTION public.request_pc_transfer(uuid,uuid,uuid,uuid,numeric,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_pc_transfer(uuid,uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_pc_transfer(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_pc_transfer(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_pc_transfer(uuid,uuid,uuid,uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_pc_transfer(uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_pc_transfer(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_pc_transfer(uuid,text) TO authenticated;