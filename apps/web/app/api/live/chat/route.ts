
import { NextRequest, NextResponse } from 'next/server';
import { contextBuilder, streamChat } from '@soryos/agent';
import { sessionStore } from '@soryos/session';
import { sandboxManager } from '@soryos/sandbox';

export async function POST(req: NextRequest) {
  const { sessionId, message } = await req.json();

  if (!sessionId || !message) {
    return NextResponse.json({ error: 'sessionId and message are required' }, { status: 400 });
  }

  try {
    sessionStore.getOrCreate(sessionId);
    const activeProviderId = sandboxManager.getActiveProviderId(sessionId);
    if (!activeProviderId) {
      return NextResponse.json({ error: 'Sandbox not found' }, { status: 404 });
    }

    const builtContext = await contextBuilder.buildContext({ sessionId, userRequest: message });

    const contextBlock = builtContext.contextItems
      .map((item) => `[${item.type}] ${item.source}\n${item.content}`)
      .join('\n\n');
    const prompt = contextBlock ? `${message}\n\nContext:\n${contextBlock}` : message;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamChat({ prompt })) {
            if (chunk.error) {
              controller.enqueue(new TextEncoder().encode(`\n[error] ${chunk.error}`));
              continue;
            }
            if (chunk.text) {
              controller.enqueue(new TextEncoder().encode(chunk.text));
            }
          }
        } finally {
          controller.close();
        }
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
