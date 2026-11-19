import express from 'express';
import { getDb } from './db/index.ts';
import {
  blockUser,
  generateSeededProfileReply,
  getFeed,
  getMatches,
  getMessages,
  getMyProfile,
  getPreferences,
  hasUndoableSwipe,
  loopFeed,
  markMessagesRead,
  recordSwipe,
  reportUser,
  resetUserDemoSwipes,
  sendMessage,
  undoLastSwipe,
  unmatchProfile,
  updateMyProfile,
  updatePreferences,
  verifyMyProfile,
} from './services/discovery.ts';
import { realtimeBus } from './services/events.ts';
import { CURRENT_USER_ID } from './types.ts';

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const db = getDb();

  // --- Realtime SSE Stream ---
  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    if (process.env.VERCEL) {
      res.write('retry: 15000\nevent: connected\ndata: {}\n\n');
      res.end();
      return;
    }

    res.write('event: connected\ndata: {}\n\n');

    const heartbeat = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 25000);

    const unsubscribe = realtimeBus.subscribeUser(CURRENT_USER_ID, (event) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // --- Discovery & Matching Routes ---
  app.get('/api/feed', (_req, res) => {
    try {
      const profiles = getFeed(db, CURRENT_USER_ID);
      const canRewind = hasUndoableSwipe(db, CURRENT_USER_ID);
      res.json({ profiles, canRewind });
    } catch (error) {
      console.error('GET /api/feed failed:', error);
      res.status(500).json({ error: 'Failed to load discovery feed' });
    }
  });

  app.post('/api/demo/reset', (_req, res) => {
    try {
      const profiles = resetUserDemoSwipes(db, CURRENT_USER_ID);
      res.json({ profiles, canRewind: false });
    } catch (error) {
      console.error('POST /api/demo/reset failed:', error);
      res.status(500).json({ error: 'Failed to reset demo profiles' });
    }
  });

  app.post('/api/feed/loop', (_req, res) => {
    try {
      const profiles = loopFeed(db, CURRENT_USER_ID);
      res.json({ profiles, canRewind: false });
    } catch (error) {
      console.error('POST /api/feed/loop failed:', error);
      res.status(500).json({ error: 'Failed to loop discovery feed' });
    }
  });

  app.post('/api/swipe', (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        res.status(400).json({ error: 'Request body must be a JSON object' });
        return;
      }

      const { targetId, action } = req.body as { targetId?: unknown; action?: unknown };
      const result = recordSwipe(db, CURRENT_USER_ID, targetId, action);

      switch (result.status) {
        case 'ok':
          if (result.data.match && typeof targetId === 'string') {
            realtimeBus.emitToUser(targetId.trim(), {
              type: 'match',
              matchId: CURRENT_USER_ID,
            });
          }
          res.status(200).json(result.data);
          return;
        case 'bad_request':
          res.status(400).json({ error: result.error });
          return;
        case 'not_found':
          res.status(404).json({ error: result.error });
          return;
        case 'conflict':
          res.status(409).json({ error: result.error });
          return;
      }
    } catch (error) {
      console.error('POST /api/swipe failed:', error);
      res.status(500).json({ error: 'Failed to record swipe' });
    }
  });

  app.post('/api/swipe/undo', (_req, res) => {
    try {
      const result = undoLastSwipe(db, CURRENT_USER_ID);
      switch (result.status) {
        case 'ok':
          res.status(200).json(result.data);
          return;
        case 'not_found':
          res.status(404).json({ error: result.error });
          return;
        case 'conflict':
          res.status(409).json({ error: result.error });
          return;
      }
    } catch (error) {
      console.error('POST /api/swipe/undo failed:', error);
      res.status(500).json({ error: 'Failed to rewind last swipe' });
    }
  });

  app.get('/api/matches', (_req, res) => {
    try {
      const matches = getMatches(db, CURRENT_USER_ID);
      res.json({ matches });
    } catch (error) {
      console.error('GET /api/matches failed:', error);
      res.status(500).json({ error: 'Failed to load matches' });
    }
  });

  app.delete('/api/matches/:targetId', (req, res) => {
    try {
      const targetId = String(req.params.targetId);
      const result = unmatchProfile(db, CURRENT_USER_ID, targetId);
      if (result.status === 'not_found') {
        res.status(404).json({ error: result.error });
        return;
      }
      realtimeBus.emitToUser(targetId, { type: 'unmatch', actorId: CURRENT_USER_ID });
      res.status(200).json({ unmatched: true });
    } catch (error) {
      console.error('DELETE /api/matches/:targetId failed:', error);
      res.status(500).json({ error: 'Failed to unmatch' });
    }
  });

  app.get('/api/matches/:targetId/messages', (req, res) => {
    try {
      const targetId = String(req.params.targetId);
      const result = getMessages(db, CURRENT_USER_ID, targetId);
      if (result.status === 'not_found') {
        res.status(404).json({ error: result.error });
        return;
      }
      if (result.data.markedReadCount > 0) {
        realtimeBus.emitToUser(targetId, { type: 'read', readerId: CURRENT_USER_ID });
      }
      res.json({
        match: result.data.match,
        messages: result.data.messages,
      });
    } catch (error) {
      console.error('GET /api/matches/:targetId/messages failed:', error);
      res.status(500).json({ error: 'Failed to load messages' });
    }
  });

  app.post('/api/matches/:targetId/messages', (req, res) => {
    try {
      const targetId = String(req.params.targetId);
      const body =
        req.body && typeof req.body === 'object' && !Array.isArray(req.body)
          ? (req.body as { body?: unknown }).body
          : undefined;
      const result = sendMessage(db, CURRENT_USER_ID, targetId, body);
      switch (result.status) {
        case 'ok':
          realtimeBus.emitToUser(targetId, {
            type: 'message',
            senderId: CURRENT_USER_ID,
            messageId: result.data.id,
          });
          if (targetId.startsWith('profile-')) {
            const outgoingBody = result.data.body;
            if (process.env.VERCEL) {
              const reply = generateSeededProfileReply(
                db,
                CURRENT_USER_ID,
                targetId,
                outgoingBody,
              );
              res.status(201).json({
                message: result.data,
                reply: reply?.message ?? null,
              });
              return;
            }
            setTimeout(() => {
              try {
                const reply = generateSeededProfileReply(
                  db,
                  CURRENT_USER_ID,
                  targetId,
                  outgoingBody,
                );
                if (!reply) return;
                if (reply.markedReadCount > 0) {
                  realtimeBus.emitToUser(CURRENT_USER_ID, {
                    type: 'read',
                    readerId: targetId,
                  });
                }
                realtimeBus.emitToUser(CURRENT_USER_ID, {
                  type: 'message',
                  senderId: targetId,
                  messageId: reply.message.id,
                });
              } catch {
                // ignore if db closed during shutdown
              }
            }, 850);
          }
          res.status(201).json({ message: result.data });
          return;
        case 'bad_request':
          res.status(400).json({ error: result.error });
          return;
        case 'not_found':
          res.status(404).json({ error: result.error });
          return;
      }
    } catch (error) {
      console.error('POST /api/matches/:targetId/messages failed:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  app.post('/api/matches/:targetId/read', (req, res) => {
    try {
      const targetId = String(req.params.targetId);
      const changed = markMessagesRead(db, CURRENT_USER_ID, targetId);
      if (changed > 0) {
        realtimeBus.emitToUser(targetId, { type: 'read', readerId: CURRENT_USER_ID });
      }
      res.json({ marked: changed });
    } catch (error) {
      console.error('POST /api/matches/:targetId/read failed:', error);
      res.status(500).json({ error: 'Failed to mark messages read' });
    }
  });

  // --- Safety: Block & Report ---
  app.post('/api/users/:targetId/block', (req, res) => {
    try {
      const targetId = String(req.params.targetId);
      const result = blockUser(db, CURRENT_USER_ID, targetId);
      switch (result.status) {
        case 'ok':
          realtimeBus.emitToUser(targetId, { type: 'unmatch', actorId: CURRENT_USER_ID });
          res.json({ blocked: true });
          return;
        case 'bad_request':
          res.status(400).json({ error: result.error });
          return;
        case 'not_found':
          res.status(404).json({ error: result.error });
          return;
      }
    } catch (error) {
      console.error('POST /api/users/:targetId/block failed:', error);
      res.status(500).json({ error: 'Failed to block user' });
    }
  });

  app.post('/api/users/:targetId/report', (req, res) => {
    try {
      const targetId = String(req.params.targetId);
      const { reason, details, block } = (req.body ?? {}) as {
        reason?: unknown;
        details?: unknown;
        block?: unknown;
      };
      const shouldBlock = block !== false;
      const result = reportUser(db, CURRENT_USER_ID, targetId, reason, details, shouldBlock);
      switch (result.status) {
        case 'ok':
          if (shouldBlock) {
            realtimeBus.emitToUser(targetId, { type: 'unmatch', actorId: CURRENT_USER_ID });
          }
          res.status(201).json({ reported: true, blocked: shouldBlock });
          return;
        case 'bad_request':
          res.status(400).json({ error: result.error });
          return;
        case 'not_found':
          res.status(404).json({ error: result.error });
          return;
      }
    } catch (error) {
      console.error('POST /api/users/:targetId/report failed:', error);
      res.status(500).json({ error: 'Failed to submit report' });
    }
  });

  // --- Filter Preferences & Profile ---
  app.get('/api/preferences', (_req, res) => {
    try {
      const preferences = getPreferences(db, CURRENT_USER_ID);
      res.json({ preferences });
    } catch (error) {
      console.error('GET /api/preferences failed:', error);
      res.status(500).json({ error: 'Failed to load preferences' });
    }
  });

  app.put('/api/preferences', (req, res) => {
    try {
      const result = updatePreferences(db, CURRENT_USER_ID, req.body);
      if (result.status === 'bad_request') {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ preferences: result.data });
    } catch (error) {
      console.error('PUT /api/preferences failed:', error);
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  });

  app.get('/api/profile/me', (_req, res) => {
    try {
      const profile = getMyProfile(db, CURRENT_USER_ID);
      if (!profile) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }
      res.json({ profile });
    } catch (error) {
      console.error('GET /api/profile/me failed:', error);
      res.status(500).json({ error: 'Failed to load profile' });
    }
  });

  app.patch('/api/profile/me', (req, res) => {
    try {
      const result = updateMyProfile(db, CURRENT_USER_ID, req.body);
      switch (result.status) {
        case 'ok':
          res.json({ profile: result.data });
          return;
        case 'bad_request':
          res.status(400).json({ error: result.error });
          return;
        case 'not_found':
          res.status(404).json({ error: result.error });
          return;
      }
    } catch (error) {
      console.error('PATCH /api/profile/me failed:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  app.post('/api/profile/verify', (req, res) => {
    try {
      const photo =
        req.body && typeof req.body === 'object' && !Array.isArray(req.body)
          ? (req.body as { photo?: unknown }).photo
          : undefined;
      const result = verifyMyProfile(db, CURRENT_USER_ID, photo);
      switch (result.status) {
        case 'ok':
          res.json({ profile: result.data });
          return;
        case 'bad_request':
          res.status(400).json({ error: result.error });
          return;
        case 'not_found':
          res.status(404).json({ error: result.error });
          return;
      }
    } catch (error) {
      console.error('POST /api/profile/verify failed:', error);
      res.status(500).json({ error: 'Failed to verify profile' });
    }
  });

  return app;
}
