/** 诊断接口已下线 */
export async function onRequestGet() {
  return Response.json({ ok: true, message: "debug endpoint disabled" });
}
