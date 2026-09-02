"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
app/page.jsx


const INACTIVE = "Inactive";
const STAGES = [
  "Not on path",
  "LOF1",
  "LOF2",
  "LOF3",
  "LOF4",
  "TRI1",
  "TRI2",
  "TRI3",
  "TRI4",
  "TRI5",
];
const TRACKS = ["—", "English", "Español", "Youth"];

/* set NEXT_PUBLIC_SHOW_PHONES=true to show phone numbers to everyone */
const SHOW_PHONES = process.env.NEXT_PUBLIC_SHOW_PHONES === "true";

/* ---------- date helpers ---------- */
const sundayOf = (d) => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  c.setDate(c.getDate() - c.getDay());
  return c;
};
const key = (d) => sundayOf(d).toISOString().slice(0, 10);
const shiftWeeks = (k, n) => {
  const d = new Date(k + "T00:00:00");
  d.setDate(d.getDate() + n * 7);
  return key(d);
};
const label = (k) =>
  new Date(k + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

/* ---------- small pieces ---------- */
function Chip({ on, children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-1 ${
        on
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-300 bg-white text-neutral-500 hover:border-neutral-900 hover:text-neutral-900"
      }`}
    >
      {children}
    </button>
  );
}

/* shrink a phone photo before upload so 354 pictures stay small */
const resizePhoto = (file, max = 640) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/jpeg", 0.8);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });

const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function Avatar({ person, size = 36, busy, onPick }) {
  return (
    <label
      className="relative shrink-0 cursor-pointer"
      style={{ width: size, height: size }}
      title={person.photo ? "Change photo" : "Add photo"}
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(person, file);
        }}
      />
      {person.photo ? (
        <img
          src={person.photo}
          alt={person.name}
          className="h-full w-full rounded-full border border-neutral-200 object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full border border-dashed border-neutral-300 bg-neutral-50 font-mono text-[11px] text-neutral-400">
          {initials(person.name)}
        </span>
      )}
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/80 text-[9px] text-neutral-500">
          …
        </span>
      )}
    </label>
  );
}

/* ---------- app ---------- */
export default function FamilyGroupTracker() {
  const [groupRows, setGroupRows] = useState([]);
  const [people, setPeople] = useState([]);
  const [attendance, setAttendance] = useState({}); // week -> personId -> {c,p}
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(null);

  const [view, setView] = useState("overview");
  const [week, setWeek] = useState(() => key(new Date()));
  const [filter, setFilter] = useState("All");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState({});
  const [noteFor, setNoteFor] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");

  const openNote = (s) => {
    setNoteDraft(s.notes || "");
    setNoteFor(noteFor === s.id ? null : s.id);
  };
  const saveNote = (s) => {
    editStudent(s.id, { notes: noteDraft.trim() });
    setNoteFor(null);
  };

  const matches = (s) => s.name.toLowerCase().includes(q.trim().toLowerCase());

  /* ---------- load ---------- */
  const load = useCallback(async () => {
    const [g, p, a] = await Promise.all([
      supabase.from("groups").select("*").order("sort"),
      supabase.from("people").select("*").order("name"),
      supabase.from("attendance").select("*"),
    ]);
    if (g.error || p.error || a.error) {
      console.error(g.error || p.error || a.error);
      setReady(true);
      return;
    }
    setGroupRows(g.data || []);
    setPeople(p.data || []);
    const weeks = {};
    (a.data || []).forEach((r) => {
      weeks[r.week] = weeks[r.week] || {};
      weeks[r.week][r.person_id] = { c: r.confirmed, p: r.present };
    });
    setAttendance(weeks);
    setReady(true);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("tracker")
      .on("postgres_changes", { event: "*", schema: "public" }, () => load())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  /* ---------- shape the data the way the screens expect ---------- */
  const nameOf = useMemo(
    () => Object.fromEntries(groupRows.map((g) => [g.id, g.name])),
    [groupRows]
  );
  const idOf = useMemo(
    () => Object.fromEntries(groupRows.map((g) => [g.name, g.id])),
    [groupRows]
  );

  const LEADERS = useMemo(
    () => groupRows.filter((g) => !g.parent_id && !g.is_inactive).map((g) => g.name),
    [groupRows]
  );
  const subs = useMemo(() => {
    const m = {};
    groupRows
      .filter((g) => g.parent_id)
      .forEach((g) => {
        const parent = nameOf[g.parent_id];
        if (!parent) return;
        m[parent] = [...(m[parent] || []), g.name];
      });
    return m;
  }, [groupRows, nameOf]);

  const students = useMemo(
    () =>
      people.map((p) => ({
        id: p.id,
        name: p.name,
        age: p.age || "",
        phone: SHOW_PHONES ? p.phone || "" : "",
        leader: nameOf[p.group_id] || INACTIVE,
        stage: p.stage || "Not on path",
        photo: p.photo_url || "",
      })),
    [people, nameOf]
  );

  const weeks = attendance;
  const marks = weeks[week] || {};

  /* ---------- hierarchy ---------- */
  const under = useCallback((l) => [l, ...(subs?.[l] || [])], [subs]);
  const allGroups = useMemo(
    () => [...LEADERS.flatMap(under), INACTIVE],
    [LEADERS, under]
  );
  const rosterOf = useCallback(
    (g) => students.filter((s) => s.leader === g),
    [students]
  );
  const teamOf = useCallback(
    (l) => students.filter((s) => under(l).includes(s.leader)),
    [students, under]
  );
  const parentOf = (g) => LEADERS.find((l) => (subs?.[l] || []).includes(g)) || null;

  /* ---------- writes ---------- */
  const mark = async (id, field) => {
    const cur = marks[id] || { c: false, p: false };
    const next = { ...cur, [field]: !cur[field] };
    setAttendance((a) => ({ ...a, [week]: { ...(a[week] || {}), [id]: next } }));
    setSaving(id);
    const { error } = await supabase.from("attendance").upsert(
      { person_id: id, week, confirmed: next.c, present: next.p, updated_at: new Date() },
      { onConflict: "person_id,week" }
    );
    setSaving(null);
    if (error) {
      console.error(error);
      setAttendance((a) => ({ ...a, [week]: { ...(a[week] || {}), [id]: cur } }));
    }
  };

  const active = useMemo(
    () => students.filter((s) => s.leader !== INACTIVE),
    [students]
  );

  const count = (list) => ({
    total: list.length,
    present: list.filter((s) => marks[s.id]?.p).length,
    confirmed: list.filter((s) => marks[s.id]?.c).length,
    kept: list.filter((s) => marks[s.id]?.c && marks[s.id]?.p).length,
  });

  const totals = useMemo(() => {
    const n = count(active);
    return {
      ...n,
      rate: n.confirmed ? Math.round((n.kept / n.confirmed) * 100) : 0,
      pct: n.total ? Math.round((n.present / n.total) * 100) : 0,
    };
  }, [active, marks]);

  const rows = useMemo(
    () =>
      LEADERS.map((l) => {
        const n = count(teamOf(l));
        return {
          leader: l,
          ...n,
          pct: n.total ? Math.round((n.present / n.total) * 100) : 0,
          subs: under(l).map((g) => {
            const m = count(rosterOf(g));
            return {
              group: g,
              own: g === l,
              ...m,
              pct: m.total ? Math.round((m.present / m.total) * 100) : 0,
            };
          }),
        };
      }).sort((a, b) => b.present - a.present || b.total - a.total),
    [LEADERS, students, marks, teamOf, under, rosterOf]
  );

  const alsoWith = useMemo(() => {
    const m = {};
    students.forEach((s) => {
      const k = s.name.trim().toLowerCase();
      m[k] = m[k] || [];
      if (!m[k].includes(s.leader)) m[k].push(s.leader);
    });
    return m;
  }, [students]);

  const lastWeeks = useMemo(() => {
    const out = [];
    for (let i = 7; i >= 0; i--) out.push(shiftWeeks(week, -i));
    return out;
  }, [week]);

  const presentIn = useCallback(
    (l, k) => {
      const m = weeks[k] || {};
      return teamOf(l).filter((s) => m[s.id]?.p).length;
    },
    [teamOf, weeks]
  );

  /* ---------- exports ---------- */
  const download = (matrix, filename) => {
    const csv = matrix.map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const head = ["Leader", "Under", "People", "Confirmed", "Present", "Percent"];
    const body = rows.flatMap((r) =>
      r.subs.length > 1
        ? [
            [r.leader, "", r.total, r.confirmed, r.present, `${r.pct}%`],
            ...r.subs.map((sg) => [
              sg.own ? `${sg.group} (direct)` : sg.group,
              r.leader,
              sg.total,
              sg.confirmed,
              sg.present,
              `${sg.pct}%`,
            ]),
          ]
        : [[r.leader, "", r.total, r.confirmed, r.present, `${r.pct}%`]]
    );
    download([head, ...body], `family-groups-${week}.csv`);
  };

  const exportRoster = () => {
    const head = [
      "Full Name", "Age", "Phone #", "Group", "Under", "Path", "Track", "Notes",
    ];
    const body = students.map((s) => [
      `"${s.name}"`,
      s.age || "",
      `"${s.phone || ""}"`,
      s.leader,
      parentOf(s.leader) || "",
      s.stage,
      s.track || "",
      `"${(s.notes || "").replace(/"/g, "'")}"`,
    ]);
    download([head, ...body], "family-groups-roster.csv");
  };

  /* ---------- editing ---------- */
  const [addLeader, setAddLeader] = useState("");
  const [names, setNames] = useState("");
  const [newLeader, setNewLeader] = useState("");
  const [newLeaderUnder, setNewLeaderUnder] = useState("");

  useEffect(() => {
    if (!addLeader && LEADERS.length) setAddLeader(LEADERS[0]);
    if (!newLeaderUnder && LEADERS.length) setNewLeaderUnder(LEADERS[0]);
  }, [LEADERS, addLeader, newLeaderUnder]);

  const addPeople = async () => {
    const fresh = names
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => ({ name: n, group_id: idOf[addLeader], stage: "Not on path" }));
    if (!fresh.length) return;
    setNames("");
    const { error } = await supabase.from("people").insert(fresh);
    if (error) console.error(error);
    load();
  };

  const addSubLeader = async () => {
    const name = newLeader.trim();
    if (!name || allGroups.includes(name)) return;
    setNewLeader("");
    const { error } = await supabase
      .from("groups")
      .insert({ name, parent_id: idOf[newLeaderUnder] });
    if (error) console.error(error);
    setOpen((o) => ({ ...o, [newLeaderUnder]: true }));
    load();
  };

  const removeSubLeader = async (parent, name) => {
    if (rosterOf(name).length) return;
    await supabase.from("groups").delete().eq("id", idOf[name]);
    load();
  };

  const [uploading, setUploading] = useState(null);

  const uploadPhoto = async (person, file) => {
    setUploading(person.id);
    try {
      const blob = await resizePhoto(file);
      const path = `${person.id}.jpg`;
      const up = await supabase.storage
        .from("photos")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { data } = supabase.storage.from("photos").getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      setPeople((ps) => ps.map((p) => (p.id === person.id ? { ...p, photo_url: url } : p)));
      const { error } = await supabase
        .from("people")
        .update({ photo_url: url })
        .eq("id", person.id);
      if (error) throw error;
    } catch (err) {
      console.error(err);
      alert("Could not save that photo. Try again.");
    }
    setUploading(null);
  };

  const editStudent = async (id, patch) => {
    const body = { ...patch };
    if (patch.leader) {
      body.group_id = idOf[patch.leader];
      delete body.leader;
    }
    setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, ...body } : p)));
    const { error } = await supabase.from("people").update(body).eq("id", id);
    if (error) console.error(error);
  };

  const removeStudent = async (id) => {
    setPeople((ps) => ps.filter((p) => p.id !== id));
    await supabase.from("people").delete().eq("id", id);
  };


  /* ---------- chrome ---------- */
  const nav = [
    ["overview", "Overview"],
    ["week", "Weeks"],
    ["growth", "Growth"],
    ["roster", "Roster"],
  ];

  const Sidebar = (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-white p-3 md:flex">
      <div className="flex items-center gap-3 px-2 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 font-mono text-lg font-medium text-white">
          F
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-neutral-900">FFG Tracker</div>
          <div className="text-[11px] uppercase tracking-wider text-neutral-400">
            Leaders · Growth
          </div>
        </div>
      </div>

      <nav className="mt-3 space-y-1">
        {nav.map(([id, name]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              view === id
                ? "bg-neutral-900 font-medium text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {name}
          </button>
        ))}
      </nav>

      <div className="mt-6 px-3 text-[11px] uppercase tracking-wider text-neutral-400">
        {LEADERS.length} Leaders
      </div>
      <div className="mt-2 space-y-0.5 overflow-y-auto">
        {LEADERS.map((l) => (
          <div key={l}>
            <div className="flex w-full items-center rounded-lg text-sm text-neutral-600 hover:bg-neutral-100">
              <button
                onClick={() =>
                  (subs?.[l] || []).length
                    ? setOpen((o) => ({ ...o, [l]: !o[l] }))
                    : (setFilter(l), setView("week"))
                }
                className="flex flex-1 items-center gap-1.5 px-3 py-1.5 text-left"
              >
                {(subs?.[l] || []).length > 0 && (
                  <span className="w-2 text-[10px] text-neutral-400">
                    {open[l] ? "▾" : "▸"}
                  </span>
                )}
                <span>{l}</span>
              </button>
              <button
                onClick={() => {
                  setFilter(l);
                  setView("week");
                }}
                className="px-3 py-1.5 font-mono text-xs tabular-nums text-neutral-400 hover:text-neutral-900"
                title={`Take attendance for ${l}`}
              >
                {teamOf(l).length}
              </button>
            </div>
            {open[l] &&
              (subs?.[l] || []).map((sg) => (
              <button
                key={sg}
                onClick={() => {
                  setFilter(sg);
                  setView("week");
                }}
                className="flex w-full items-center justify-between rounded-lg py-1 pl-7 pr-3 text-[13px] text-neutral-500 hover:bg-neutral-100"
              >
                <span className="truncate">↳ {sg}</span>
                <span className="font-mono text-xs tabular-nums text-neutral-400">
                  {rosterOf(sg).length}
                </span>
              </button>
              ))}
          </div>
        ))}
        <button
          onClick={() => {
            setFilter(INACTIVE);
            setView("week");
          }}
          className="mt-2 flex w-full items-center justify-between rounded-lg border-t border-neutral-100 px-3 pb-1.5 pt-3 text-sm text-neutral-400 hover:bg-neutral-100"
        >
          <span>{INACTIVE}</span>
          <span className="font-mono text-xs tabular-nums">{rosterOf(INACTIVE).length}</span>
        </button>
      </div>
    </aside>
  );

  const WeekNav = (
    <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1">
      <button
        onClick={() => setWeek(shiftWeeks(week, -1))}
        className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100"
        aria-label="Previous week"
      >
        ←
      </button>
      <span className="min-w-[104px] text-center font-mono text-[13px] tabular-nums text-neutral-900">
        Week of {label(week)}
      </span>
      <button
        onClick={() => setWeek(shiftWeeks(week, 1))}
        className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100"
        aria-label="Next week"
      >
        →
      </button>
    </div>
  );

  if (!ready)
    return (
      <div className="flex h-screen items-center justify-center bg-white font-sans text-sm text-neutral-400">
        Loading tracker…
      </div>
    );

  const empty = students.length === 0;
  const visibleGroups = allGroups.filter(
    (g) => filter === "All" ? g !== INACTIVE : g === filter || under(filter).includes(g)
  );

  return (
    <div className="flex min-h-screen bg-neutral-50 font-sans text-neutral-900 antialiased">
      {Sidebar}

      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 font-mono text-sm text-white">
              F
            </div>
            <span className="text-sm font-semibold">FFG Tracker</span>
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {nav.map(([id, name]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] ${
                  view === id
                    ? "bg-neutral-900 font-medium text-white"
                    : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto max-w-5xl p-4 md:p-8">
          {/* ---------------- OVERVIEW ---------------- */}
          {view === "overview" && (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
                <div className="flex items-center gap-2">
                  {WeekNav}
                  <button
                    onClick={exportCsv}
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[13px] font-medium hover:border-neutral-900"
                  >
                    ↓ CSV
                  </button>
                </div>
              </div>

              {empty ? (
                <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
                  <p className="text-sm text-neutral-600">
                    No one on the roster yet. Add your people and the numbers fill in.
                  </p>
                  <button
                    onClick={() => setView("roster")}
                    className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                  >
                    Add people
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {rows.map((r) => {
                      const hasSubs = r.subs.length > 1;
                      const isOpen = !!open[r.leader];
                      return (
                        <div
                          key={r.leader}
                          className={`rounded-xl border bg-white p-4 ${
                            isOpen ? "border-neutral-900" : "border-neutral-200"
                          }`}
                        >
                          <button
                            onClick={() =>
                              hasSubs
                                ? setOpen((o) => ({ ...o, [r.leader]: !o[r.leader] }))
                                : (setFilter(r.leader), setView("week"))
                            }
                            className="w-full text-left"
                          >
                            <div className="font-mono text-3xl font-medium tabular-nums tracking-tight">
                              {r.present}
                              <span className="text-base text-neutral-400"> / {r.total}</span>
                            </div>
                            <div className="mt-1 flex items-baseline justify-between">
                              <span className="text-[13px] font-medium text-neutral-700">
                                {r.leader}
                                {hasSubs && (
                                  <span className="ml-1 text-neutral-400">
                                    {isOpen ? "▾" : "▸"}
                                  </span>
                                )}
                              </span>
                              <span className="font-mono text-[13px] tabular-nums text-neutral-500">
                                {r.pct}%
                              </span>
                            </div>
                            <div className="mt-3 h-1 w-full rounded-full bg-neutral-100">
                              <div
                                className="h-1 rounded-full bg-neutral-900 transition-all"
                                style={{ width: `${r.pct}%` }}
                              />
                            </div>
                          </button>

                          {hasSubs && isOpen && (
                            <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-3">
                              {r.subs.map((sg) => (
                                <li key={sg.group}>
                                  <button
                                    onClick={() => {
                                      setFilter(sg.group);
                                      setView("week");
                                    }}
                                    className="flex w-full items-baseline justify-between rounded px-1 py-0.5 text-left hover:bg-neutral-100"
                                  >
                                    <span className="truncate text-[12px] text-neutral-600">
                                      {sg.own ? `${sg.group} (direct)` : sg.group}
                                    </span>
                                    <span className="ml-2 shrink-0 font-mono text-[12px] tabular-nums text-neutral-500">
                                      {sg.present}/{sg.total} · {sg.pct}%
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-baseline justify-between rounded-xl border border-neutral-900 bg-neutral-900 p-4 text-white">
                    <span className="text-[13px] font-medium">All groups</span>
                    <span className="font-mono text-2xl font-medium tabular-nums">
                      {totals.present}
                      <span className="text-base text-neutral-400"> / {totals.total}</span>
                      <span className="ml-3 text-[13px] text-neutral-300">{totals.pct}%</span>
                    </span>
                  </div>
                </>
              )}
            </>
          )}

          {/* ---------------- WEEKS ---------------- */}
          {view === "week" && (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-semibold tracking-tight">Take attendance</h1>
                {WeekNav}
              </div>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search a name"
                className="mb-4 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
              />

              <div className="mb-4 flex flex-wrap gap-1.5">
                {["All", ...LEADERS, INACTIVE].map((l) => (
                  <button
                    key={l}
                    onClick={() => setFilter(l)}
                    className={`rounded-full px-3 py-1.5 text-[13px] ${
                      filter === l || under(l).includes(filter)
                        ? "bg-neutral-900 font-medium text-white"
                        : "border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-900"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              <div className="space-y-6">
                {visibleGroups.map((g) => {
                  const list = rosterOf(g).filter(matches);
                  if (!list.length) return null;
                  const p = parentOf(g);
                  return (
                    <section
                      key={g}
                      className="overflow-hidden rounded-xl border border-neutral-200 bg-white"
                    >
                      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5">
                        <span className="text-[15px] font-semibold">
                          {g}
                          {p && (
                            <span className="ml-2 text-[12px] font-normal text-neutral-400">
                              under {p}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-neutral-400">
                          {list.filter((s) => marks[s.id]?.p).length}/{list.length} present
                        </span>
                      </div>
                      <ul>
                        {list.map((s) => (
                          <li
                            key={s.id}
                            className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-4 py-2.5 first:border-t-0"
                          >
                            <Avatar
                              person={s}
                              size={32}
                              busy={uploading === s.id}
                              onPick={uploadPhoto}
                            />
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block truncate text-sm ${
                                  marks[s.id]?.p ? "text-neutral-900" : "text-neutral-500"
                                }`}
                              >
                                {s.name}
                                {s.stage && s.stage !== "Not on path" && (
                                  <span className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white">
                                    {s.stage}
                                  </span>
                                )}
                                {s.track && (
                                  <span className="ml-2 font-mono text-[11px] text-neutral-400">
                                    {s.track}
                                  </span>
                                )}
                                {s.age && (
                                  <span className="ml-2 font-mono text-[11px] tabular-nums text-neutral-400">
                                    Age {s.age}
                                  </span>
                                )}
                              </span>
                              {s.phone && (
                                <a
                                  href={`tel:${s.phone.replace(/[^0-9+]/g, "")}`}
                                  className="block truncate font-mono text-[11px] tabular-nums text-neutral-400 hover:text-neutral-900"
                                >
                                  {s.phone}
                                </a>
                              )}
                            </span>
                            <span className="flex shrink-0 gap-1.5">
                              <Chip on={marks[s.id]?.c} onClick={() => mark(s.id, "c")}>
                                Confirmed
                              </Chip>
                              <Chip on={marks[s.id]?.p} onClick={() => mark(s.id, "p")}>
                                Present
                              </Chip>
                              <Chip on={!!s.notes} onClick={() => openNote(s)} title="Note">
                                Note
                              </Chip>
                            </span>
                            {noteFor === s.id ? (
                              <span className="mt-2 flex w-full flex-col gap-2">
                                <textarea
                                  value={noteDraft}
                                  onChange={(e) => setNoteDraft(e.target.value)}
                                  rows={3}
                                  autoFocus
                                  placeholder="Notes on where they're at, prayer needs, follow-up…"
                                  className="w-full rounded-lg border border-neutral-300 p-2 text-[13px] placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
                                />
                                <span className="flex gap-2">
                                  <button
                                    onClick={() => saveNote(s)}
                                    className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
                                  >
                                    Save note
                                  </button>
                                  <button
                                    onClick={() => setNoteFor(null)}
                                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600"
                                  >
                                    Cancel
                                  </button>
                                </span>
                              </span>
                            ) : (
                              s.notes && (
                                <button
                                  onClick={() => openNote(s)}
                                  className="mt-1 w-full text-left text-[12px] leading-snug text-neutral-500 hover:text-neutral-900"
                                >
                                  {s.notes}
                                </button>
                              )
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </>
          )}

          {/* ---------------- GROWTH ---------------- */}
          {view === "growth" && (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-semibold tracking-tight">Growth</h1>
                {WeekNav}
              </div>

              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="border-b border-neutral-200 px-4 py-3 text-[13px] text-neutral-500">
                  Attendance over the last 8 weeks · darker means fuller room
                </div>
                <ul>
                  {LEADERS.map((l) => {
                    const size = teamOf(l).length;
                    const now = presentIn(l, week);
                    const delta = now - presentIn(l, shiftWeeks(week, -1));
                    return (
                      <li
                        key={l}
                        className="flex items-center gap-4 border-t border-neutral-100 px-4 py-3 first:border-t-0"
                      >
                        <span className="w-20 shrink-0 text-sm font-medium">{l}</span>
                        <span className="flex gap-1">
                          {lastWeeks.map((k) => {
                            const n = presentIn(l, k);
                            const ratio = size ? n / size : 0;
                            return (
                              <span
                                key={k}
                                title={`${label(k)} · ${n} present`}
                                className="h-6 w-5 rounded-sm border border-neutral-200"
                                style={{
                                  backgroundColor: `rgba(10,10,10,${n ? 0.15 + ratio * 0.85 : 0})`,
                                }}
                              />
                            );
                          })}
                        </span>
                        <span className="ml-auto flex items-baseline gap-2">
                          <span className="font-mono text-lg tabular-nums">{now}</span>
                          <span className="font-mono text-xs tabular-nums text-neutral-400">
                            /{size}
                          </span>
                          <span
                            className={`w-10 text-right font-mono text-xs tabular-nums ${
                              delta > 0
                                ? "text-neutral-900"
                                : delta < 0
                                ? "text-neutral-400"
                                : "text-neutral-300"
                            }`}
                          >
                            {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : "—"}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
                <div className="mb-4 text-[13px] text-neutral-500">All groups combined</div>
                <div className="flex h-32 items-end gap-2">
                  {lastWeeks.map((k) => {
                    const n = LEADERS.reduce((t, l) => t + presentIn(l, k), 0);
                    const max = Math.max(
                      1,
                      ...lastWeeks.map((w2) =>
                        LEADERS.reduce((t, l) => t + presentIn(l, w2), 0)
                      )
                    );
                    return (
                      <div key={k} className="flex flex-1 flex-col items-center gap-2">
                        <span className="font-mono text-[11px] tabular-nums text-neutral-400">
                          {n}
                        </span>
                        <div
                          className={`w-full rounded-t-sm ${
                            k === week ? "bg-neutral-900" : "bg-neutral-300"
                          }`}
                          style={{ height: `${(n / max) * 88}px` }}
                        />
                        <span className="font-mono text-[10px] tabular-nums text-neutral-400">
                          {label(k).split(" ")[1]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ---------------- ROSTER ---------------- */}
          {view === "roster" && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-semibold tracking-tight">
                  Roster
                  <span className="ml-2 font-mono text-sm font-normal tabular-nums text-neutral-400">
                    {active.length} active · {students.length - active.length} inactive
                  </span>
                </h1>
                <button
                  onClick={exportRoster}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] font-medium hover:border-neutral-900"
                >
                  ↓ Export roster
                </button>
              </div>

              <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
                <div className="mb-3 text-[13px] font-medium">Add a leader</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={newLeader}
                    onChange={(e) => setNewLeader(e.target.value)}
                    placeholder="Leader's name"
                    className="h-10 flex-1 rounded-lg border border-neutral-300 px-3 text-sm placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
                  />
                  <select
                    value={newLeaderUnder}
                    onChange={(e) => setNewLeaderUnder(e.target.value)}
                    className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm sm:w-44"
                  >
                    {LEADERS.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                  <button
                    onClick={addSubLeader}
                    className="h-10 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-700"
                  >
                    Add under {newLeaderUnder}
                  </button>
                </div>
                <p className="mt-2 text-[12px] text-neutral-500">
                  New leaders get their own group and roll up into the leader above them.
                </p>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="mb-3 text-[13px] font-medium">Add people</div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <select
                    value={addLeader}
                    onChange={(e) => setAddLeader(e.target.value)}
                    className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm sm:w-44"
                  >
                    {allGroups.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                  <textarea
                    value={names}
                    onChange={(e) => setNames(e.target.value)}
                    rows={3}
                    placeholder="One name per line"
                    className="flex-1 rounded-lg border border-neutral-300 p-3 text-sm placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
                  />
                </div>
                <button
                  onClick={addPeople}
                  className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                >
                  Add to {addLeader}
                </button>
              </div>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search a name"
                className="mt-6 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
              />

              <div className="mt-4 space-y-6">
                {[
                  ...LEADERS.flatMap((l) => (open[l] ? under(l) : [l])),
                  INACTIVE,
                ].map((g) => {
                  const list = rosterOf(g).filter(matches);
                  const p = parentOf(g);
                  const kids = subs?.[g] || [];
                  return (
                    <section
                      key={g}
                      className={`overflow-hidden rounded-xl border bg-white ${
                        p ? "ml-0 border-neutral-200 sm:ml-6" : "border-neutral-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2.5">
                        <span className="truncate text-[15px] font-semibold">
                          {p && <span className="mr-1 text-neutral-300">↳</span>}
                          {g}
                          {p && (
                            <span className="ml-2 text-[12px] font-normal text-neutral-400">
                              under {p}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          {kids.length > 0 && (
                            <button
                              onClick={() => setOpen((o) => ({ ...o, [g]: !o[g] }))}
                              className="rounded-full border border-neutral-300 px-2 py-0.5 text-[11px] font-medium text-neutral-600 hover:border-neutral-900"
                            >
                              {open[g] ? "▾" : "▸"} {kids.length} leaders
                            </button>
                          )}
                          {p && !rosterOf(g).length && (
                            <button
                              onClick={() => removeSubLeader(p, g)}
                              className="text-xs text-neutral-400 hover:text-neutral-900"
                            >
                              Remove leader
                            </button>
                          )}
                          <span className="font-mono text-xs tabular-nums text-neutral-400">
                            {rosterOf(g).length}
                          </span>
                        </span>
                      </div>
                      {list.length === 0 ? (
                        <p className="px-4 py-4 text-[13px] text-neutral-400">
                          No one assigned yet.
                        </p>
                      ) : (
                        <ul>
                          {list.map((s) => (
                            <li
                              key={s.id}
                              className="flex flex-wrap items-center gap-3 border-t border-neutral-100 px-4 py-3 first:border-t-0"
                            >
                              <Avatar
                                person={s}
                                busy={uploading === s.id}
                                onPick={uploadPhoto}
                              />
                              <span className="min-w-[150px] flex-1">
                                <span className="block truncate text-sm">
                                  {s.name}
                                  {alsoWith[s.name.trim().toLowerCase()]?.length > 1 && (
                                    <span className="ml-2 rounded border border-neutral-300 px-1 py-0.5 align-middle text-[10px] uppercase tracking-wide text-neutral-500">
                                      also{" "}
                                      {alsoWith[s.name.trim().toLowerCase()]
                                        .filter((x) => x !== g)
                                        .join(", ")}
                                    </span>
                                  )}
                                </span>
                                <span className="block font-mono text-[11px] tabular-nums text-neutral-400">
                                  {s.stage && s.stage !== "Not on path" && (
                                    <span className="mr-2 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                      {s.stage}
                                    </span>
                                  )}
                                  {s.track && <span className="mr-2">{s.track}</span>}
                                  {s.age && <span>Age {s.age}</span>}
                                  {s.age && s.phone && <span> · </span>}
                                  {s.phone ? (
                                    <a
                                      href={`tel:${s.phone.replace(/[^0-9+]/g, "")}`}
                                      className="hover:text-neutral-900"
                                    >
                                      {s.phone}
                                    </a>
                                  ) : (
                                    !s.age && "—"
                                  )}
                                </span>
                              </span>
                              <select
                                value={s.leader}
                                onChange={(e) => editStudent(s.id, { leader: e.target.value })}
                                className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-xs"
                              >
                                {allGroups.map((x) => (
                                  <option key={x}>{x}</option>
                                ))}
                              </select>
                              <select
                                value={s.stage}
                                onChange={(e) => editStudent(s.id, { stage: e.target.value })}
                                className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-xs"
                                title="Where they are on the path"
                              >
                                {STAGES.map((st) => (
                                  <option key={st}>{st}</option>
                                ))}
                              </select>
                              <select
                                value={s.track || "—"}
                                onChange={(e) =>
                                  editStudent(s.id, {
                                    track: e.target.value === "—" ? "" : e.target.value,
                                  })
                                }
                                className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-xs"
                                title="English, Español, or Youth"
                              >
                                {TRACKS.map((t) => (
                                  <option key={t}>{t}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => openNote(s)}
                                className={`text-xs ${
                                  s.notes ? "text-neutral-900" : "text-neutral-400"
                                } hover:text-neutral-900`}
                              >
                                {s.notes ? "Note ●" : "Note"}
                              </button>
                              <button
                                onClick={() => removeStudent(s.id)}
                                className="text-xs text-neutral-400 hover:text-neutral-900"
                                aria-label={`Remove ${s.name}`}
                              >
                                Remove
                              </button>
                            {noteFor === s.id ? (
                              <span className="mt-2 flex w-full flex-col gap-2">
                                <textarea
                                  value={noteDraft}
                                  onChange={(e) => setNoteDraft(e.target.value)}
                                  rows={3}
                                  autoFocus
                                  placeholder="Notes on where they're at, prayer needs, follow-up…"
                                  className="w-full rounded-lg border border-neutral-300 p-2 text-[13px] placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
                                />
                                <span className="flex gap-2">
                                  <button
                                    onClick={() => saveNote(s)}
                                    className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
                                  >
                                    Save note
                                  </button>
                                  <button
                                    onClick={() => setNoteFor(null)}
                                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600"
                                  >
                                    Cancel
                                  </button>
                                </span>
                              </span>
                            ) : (
                              s.notes && (
                                <button
                                  onClick={() => openNote(s)}
                                  className="mt-1 w-full text-left text-[12px] leading-snug text-neutral-500 hover:text-neutral-900"
                                >
                                  {s.notes}
                                </button>
                              )
                            )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
