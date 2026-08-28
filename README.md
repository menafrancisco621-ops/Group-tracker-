# Family Group Tracker

Attendance and growth for six leaders and the leaders under them.
Open link, no accounts: anyone with the URL can mark attendance and add people.

## Put it online (about 20 minutes)

### 1. Supabase (the back end — this is yours)

1. Create a project at supabase.com. Save the database password.
2. SQL Editor → paste `supabase/schema-open.sql` → Run.
3. SQL Editor → paste `supabase/seed.sql` → Run. Loads 46 groups and 354 people.
4. Settings → API → copy the **Project URL** and the **anon public** key.

The Table Editor is your back end. Rows added by leaders show up there,
and it is the only place a person can be deleted.

### 2. Vercel (the site)

1. Push this folder to GitHub.
2. vercel.com → Add New Project → import the repo.
3. Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` — the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the anon key
   - `NEXT_PUBLIC_SHOW_PHONES` — `false` (see below)
4. Deploy. Share the URL with your leaders.

Run locally with `npm install` then `npm run dev`, using a `.env.local`
copied from `.env.example`.

## Phone numbers

`NEXT_PUBLIC_SHOW_PHONES` is `false` by default, so the site shows names,
ages, groups, and attendance but not phone numbers. The numbers stay in
Supabase where you can see them. Since the link is open and many of these
people are minors, leave it off unless the leaders truly need to call from
the site. Flip it to `true` and redeploy if you decide otherwise.

## What leaders can do

- Mark Confirmed and Present for anyone, in any group
- Add people to any group
- Edit a person's group, stage, and activities
- Add a new leader under one of the six

Everyone sees everything, because the link is open. When you want each
leader limited to their own group, the rules are already written in
`schema.sql` — swap them in and add a login.

## Notes

- Two leaders marking at the same time is fine; changes stream live.
- The week always starts Sunday. Arrows move between weeks.
- Overview and Growth exclude the Inactive group.
