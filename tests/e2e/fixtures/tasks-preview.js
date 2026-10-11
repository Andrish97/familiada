// Przykładowe dane do przeglądu wszystkich widocznych wariantów Zadania.
// Statusy odrzucone/cofnięte/wygasłe nie są zwracane przez tasks_list.
const created_at = "2026-10-11T09:00:00Z";
const done_at = "2026-10-11T10:00:00Z";
const task = (id, extra) => ({ id, owner_label: "Agnieszka", created_at, state: "todo", token: `preview-${id}`, ...extra });
const tasksPreview = [
  task("text-todo", { kind: "poll", poll_type: "poll_text", title: "Rodzinny wieczór — ankieta tekstowa" }),
  task("points-todo", { kind: "poll", poll_type: "poll_points", title: "Najlepsze wakacje — ankieta punktowa" }),
  task("base-viewer", { kind: "base", role: "viewer", title: "Pytania rodzinne — przeglądający" }),
  task("base-editor", { kind: "base", role: "editor", title: "Muzyka i film — edytor" }),
  ...["host", "buzzer", "display", "poll_qr"].map((device_type) => task(`device-${device_type}`, { kind: "device", device_type, title: "Rodzinna Familiada", expires_at: "2026-10-11T15:30:00Z" })),
  task("text-done", { kind: "poll", poll_type: "poll_text", title: "Rodzinny wieczór — oddano głos", state: "done", done_at }),
  task("points-done", { kind: "poll", poll_type: "poll_points", title: "Najlepsze wakacje — oddano głos", state: "done", done_at }),
];
module.exports = { tasksPreview };
