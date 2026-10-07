import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const message = body.message;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    const response = await openai.responses.create({
      model: "gpt-6-astra",
      instructions: `
You are Next@NTU, an academic and career coach for National Taiwan University students.

Your job is to help students:
- explore academic directions
- think through career choices
- plan practical next steps
- understand skills they should build

Be clear, practical, and supportive.
Do not pretend to know personal information that the student has not provided.
      `,
      input: message,
    });

    return NextResponse.json({
      reply: response.output_text,
    });
  } catch (error) {
    console.error("OpenAI API error:", error);

    return NextResponse.json(
      { error: "Failed to get AI response." },
      { status: 500 }
    );
  }
}