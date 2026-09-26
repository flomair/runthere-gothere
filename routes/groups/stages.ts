import { authed } from '../../server/access.js';
import { HttpError, json, readJson } from '../../server/http.js';
import { type StageInput, createStage, listStages, stageAction } from '../../server/stages.js';

/** GET ?id=<group> – race stages of a shared journey, evaluated against the latest runs. */
export const GET = authed(async (req, user) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'missing id');
  return json({ stages: await listStages(user, id) }, { headers: { 'Cache-Control': 'no-store' } });
});

/** POST { id, name?, fromM, toM, startDate, days, participants, prize } – set up a stage. */
export const POST = authed(async (req, user) => {
  const body = await readJson<StageInput & { id?: string }>(req);
  if (!body.id) throw new HttpError(400, 'missing id');
  return json({ stage: await createStage(user, body.id, body) });
});

/** PATCH { id, stageId, action: 'cancel' | 'delivered' } */
export const PATCH = authed(async (req, user) => {
  const body = await readJson<{ id?: string; stageId?: string; action?: string }>(req);
  if (!body.id || !body.stageId || !body.action) throw new HttpError(400, 'missing id, stageId or action');
  return json({ stage: await stageAction(user, body.id, body.stageId, body.action) });
});
