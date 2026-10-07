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
You generate concise conversation titles for Next@NTU.

The user is a university student asking about topics such as:
- academics
- career planning
- internships
- graduate school
- courses
- skills
- clubs
- personal development

Your task is to summarize the user's main question into a short Traditional Chinese title.

Rules:
- Prefer 6–12 Chinese characters.
- Describe the actual topic clearly.
- Do not write a full sentence.
- Do not use quotation marks.
- Do not add punctuation at the end.
- Do not explain your answer.
- Return only the title.

Examples:

User:
我是台大財金系學生，最近對個股研究有興趣，未來可以怎麼規劃職涯？

Title:
個股研究職涯規劃

User:
我在考慮要申請研究所還是直接工作

Title:
研究所 vs 直接就業

User:
我想找資料分析實習但不知道要準備什麼

Title:
資料分析實習準備

User:
我想知道大二應該怎麼安排選課

Title:
大二選課規劃
`,
      input: message,
    });

    const title = response.output_text.trim();

    return NextResponse.json({
      title,
    });
  } catch (error) {
    console.error(
      "Conversation title generation error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to generate conversation title.",
      },
      { status: 500 }
    );
  }
}