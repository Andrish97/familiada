// Fixture korzysta z rzeczywistego cyklu zaproszenia i zgody odbiorcy.
// Bez bezpośredniego INSERT/UPDATE tabeli dostępów.
async function acceptBaseShare(ownerPage, recipientPage, baseId, userId, role) {
  const taskId = await ownerPage.evaluate(async ({ baseId, userId, role }) => {
    const sb = window.__sbClient;
    const { data: existing, error: readError } = await sb.from("question_base_shares")
      .select("user_id").eq("base_id", baseId).eq("user_id", userId);
    if (readError) throw readError;
    if (existing?.length) {
      const { data, error } = await sb.rpc("update_base_share_role", { p_base_id: baseId, p_user_id: userId, p_role: role });
      if (error || !(Array.isArray(data) ? data[0] : data)?.ok) throw new Error(error?.message || "base role update failed");
      return null;
    }
    const { data, error } = await sb.rpc("base_share_by_user", { p_base_id: baseId, p_recipient_user_id: userId, p_role: role });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || (!row?.ok && row?.err !== "already_pending")) throw new Error(error?.message || row?.err || "base invitation failed");
    const { data: tasks, error: taskError } = await sb.rpc("list_base_share_tasks_outgoing", { p_base_id: baseId });
    if (taskError) throw taskError;
    const task = tasks.find(t => t.recipient_user_id === userId && ["pending", "opened"].includes(t.status));
    if (!task) throw new Error("base invitation not found");
    return task.task_id;
  }, { baseId, userId, role });
  if (!taskId) return;
  await recipientPage.evaluate(async taskId => {
    const { data, error } = await window.__sbClient.rpc("base_share_accept", { p_task_id: taskId });
    if (error || data !== true) throw new Error(error?.message || "recipient did not accept base invitation");
  }, taskId);
}

module.exports = { acceptBaseShare };
