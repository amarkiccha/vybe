# VYBE — More than Messages.

Premium multilingual messaging app: Chats, Stories & Snaps, Communities, Broadcast. 8 UI languages (en, kn, hi, te, ta, ml, mr, bn).

## Structure
```
backend/
  server.py            # thin gateway required by the platform (:8001) -> starts & proxies to the Node API
  .env                 # secrets (never commit)  — see .env.example
  node/                # VYBE API: Node.js + Express + TypeScript + Mongoose
    src/server.ts      # app, routes, error handling, scheduler
    src/models.ts      # all Mongoose schemas + indexes (schema v1)
    src/lib.ts         # auth middleware, sessions, rate limiting, content filter, helpers
    src/storage.ts     # object storage client (Emergent managed)
    src/routes/        # auth, users+reports, chats+messages, stories, communities, broadcast, media
    src/seed.ts        # DEV-ONLY demo data (SEED_DEMO=true)
    test/api.test.ts   # API + locale-parity tests
frontend/              # Expo (SDK 57) + expo-router + TypeScript
  app/                 # screens: language, auth, (tabs)/{index,stories,communities,broadcast}, chat/[id], chat-info/[id],
                       # new-chat, story/[userId], story-create, camera, community/[id], community-create, campaign-new, campaign/[id], settings
  src/locales/*.json   # translation dictionaries (identical keys, English fallback)
  src/i18n.ts          # i18next setup, locale-aware time/number formatting
  src/api.ts           # typed API client, media URLs, uploads
  src/components/      # design system (ui.tsx) + chat components
scripts/translate_locales.py  # regenerates locales from en.json (have native speakers review)
```

## Run
- Backend: `sudo supervisorctl restart backend` (uvicorn :8001 spawns `node src/server.ts` on NODE_API_PORT). Logs: `/var/log/supervisor/vybe-node.log`.
- Standalone Node API: `cd backend/node && npm i && node src/server.ts` (Node >= 23.6, native TS type stripping).
- Type check: `cd backend/node && npm run typecheck`; Tests: `npm test` (API must be running).
- Frontend: `cd frontend && yarn expo start`.

## Environment (backend/.env)
MONGO_URL, DB_NAME, JWT_SECRET, EMERGENT_LLM_KEY (object storage), NODE_API_PORT, APP_NAME, SEED_DEMO,
LARGE_CAMPAIGN_THRESHOLD (confirmation), APPROVAL_THRESHOLD, MAX_CAMPAIGN_RECIPIENTS, DAILY_SEND_LIMIT.

## API (all under /api, JSON, Bearer token)
- auth: POST /auth/register, /auth/login (pin when 2-step), GET /auth/me, POST /auth/logout, GET/DELETE /auth/sessions[/:id], POST /auth/two-step, DELETE /auth/account, GET /auth/export, POST /auth/recover (501 until provider configured)
- users: GET /users/search?q, PATCH /users/me, PUT /users/me/close-friends, GET /users/blocked, POST|DELETE /users/:id/block, POST /users/:id/mute-stories
- reports: POST /reports, GET/PATCH /reports/admin (admins)
- conversations: GET /conversations?filter=all|unread|groups|favorites|requests|archived&q, POST /conversations (direct|group), GET|PATCH /conversations/:id, members add/role/remove, POST :id/read, :id/typing, :id/pin, GET :id/messages?before|since, POST :id/messages (idempotent clientId)
- messages: GET /messages/search?q, PATCH|DELETE /messages/:id (15 min edit / 1 h delete), POST :id/react, :id/forward (max 5, 1 if highly forwarded), :id/view (view-once)
- stories: GET /stories/feed?scope=all|friends|explore, POST /stories, POST :id/view|react|reply, GET :id/viewers (owner), DELETE :id — TTL expiry 24 h
- communities: GET /communities?category&q, /communities/mine, POST /communities, GET :id, POST :id/join|leave|invite|channels, GET :id/members, POST :id/members/:uid/(approve|remove|ban|admin|moderator|member), GET|POST /communities/channels/:cid/messages, POST /communities/messages/:id/vote|react|pin, DELETE /communities/messages/:id
- broadcast: contacts CRUD, POST /broadcast/contacts/import {csv, commit}, segments, templates, campaigns CRUD, POST campaigns/:id/submit {confirm} | approve, GET /broadcast/analytics, POST /broadcast/unsubscribe
- media: POST /media/upload (25 MB, type allow-list), GET /media/:id (authorization checked per conversation/story/community/campaign)

## Feature status (honest)
Completed: email+password auth with revocable sessions, lockout, optional 2-step PIN, device/session list; 1:1 & group chat with persistence, pagination, dedup, delivery/read receipts, typing, replies, reactions, edit/delete rules, forwarding limits, pinning, search, mute/archive/favorite, message requests, block/report, disappearing & view-once snaps, image/video/doc/voice; Stories (text/image/video, audiences, viewers, reactions, replies, mute, report, 24 h TTL); Snap camera (photo/video, flip, flash, text, stickers, colour filters baked into photo); Communities (public/private, roles, approvals, bans, channels, polls, pins, files, search, rate limits, keyword filter); Broadcast (contacts, consent records, CSV import preview, segments, templates, scheduling, confirmation & approval thresholds, daily limits, suppression, unsubscribe, VYBE-native delivery + analytics); 8 languages; light/dark theme.
Partial: real-time is HTTP polling (2.5 s) rather than WebSocket; content filter is keyword-based; drawing/cropping (gallery crop only); video overlays not baked; approval workflow is self-approval (single-owner orgs); account recovery endpoint returns 501.
Not implemented: end-to-end encryption (messages are TLS in transit, stored server-side — UI states this), voice/video calls (WebRTC/TURN), push notifications (FCM), phone OTP, external SMS/WhatsApp delivery provider, image/video ML screening, Socket.IO.
External accounts still needed: SMS/OTP provider (e.g. Twilio/MSG91), WhatsApp Business/SMS provider for external campaigns, Firebase (google-services.json) for push, TURN server for calls.

## Android build
Use the Emergent **Publish** button to deploy and generate Android/iOS builds (package: `com.emergent.vybemessenger.wso3gh`).
