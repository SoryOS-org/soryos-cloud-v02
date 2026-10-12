
import { NextRequest, NextResponse } from 'next/server';
import { toolRegistry } from '@soryos/tool';
import { contextBuilder, streamChat } from '@soryos/agent';
import { sessionStore } from '@soryos/session';
import { sandboxManager } from '@soryos/sandbox';

export async function POST(req: NextRequest) {
  const { sessionId, message, agentMode = 'build' } = await req.json();

  if (!sessionId || !message) {
    return NextResponse.json({ error: 'sessionId and message are required' }, { status: 400 });
  }

  try {
    const session = sessionStore.getOrCreate(sessionId);
    const sandbox = await sandboxManager.getSandbox(session.sandbox_id);
    if (!sandbox) {
      return NextResponse.json({ error: 'Sandbox not found' }, { status: 404 });
    }

    const builtContext = await contextBuilder.buildContextForRequest(sessionId, message, {});

    const stream = new ReadableStream({
      async start(controller) {
        await streamChat({
          providerId: 'openai', // Or resolve from session/settings
          model: 'gpt-4o-mini',
          messages: builtContext.messages.map(m => ({ role: m.role as any, content: m.content })),
          sessionId,
          onDelta: (text) => {
            controller.enqueue(new TextEncoder().encode(text));
          },
        });
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (error) {
    console.error('[LiveChat API]', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
