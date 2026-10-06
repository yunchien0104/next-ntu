import type { ResumeData } from "@/lib/types";

export function ResumePreview({ resume }: { resume: ResumeData }) {
  const contact = [resume.profile.phone ? `Tel: ${resume.profile.phone}` : "", resume.profile.email ? `Email: ${resume.profile.email}` : "", resume.profile.linkedIn].filter(Boolean).join(" | ");

  return (
    <article data-resume-paper className="mx-auto min-h-[940px] w-full max-w-[760px] bg-white px-10 py-12 font-serif text-[11px] leading-[1.45] text-black shadow-2xl">
      <header className="border-b-2 border-black pb-3 text-center"><h1 className="text-[26px] font-bold tracking-[.06em]">{resume.profile.fullName || "YOUR NAME"}</h1><p className="mt-1">{resume.profile.cityCountry}</p><p className="mt-1 text-[10px]">{contact}</p></header>
      {resume.sections.map((section) => (
        <section key={section.id} className="mt-5">
          <h2 className="border-b border-black pb-0.5 text-[12px] font-bold uppercase tracking-[.08em]">{section.title}</h2>
          <div className="mt-2 space-y-3">
            {section.entries.map((entry, index) => section.type === "skills" ? (
              <div key={index} className="flex gap-2"><b>{entry.organization}:</b><span>{entry.description}</span></div>
            ) : (
              <div key={index}>
                <div className="flex items-baseline justify-between gap-4"><b>{[entry.organization, entry.location].filter(Boolean).join(", ")}</b><time className="shrink-0">{[entry.startDate, entry.endDate].filter(Boolean).join(" - ")}</time></div>
                {entry.role && <div className="italic">{entry.role}</div>}
                {entry.description && <ul className="mt-1 list-disc space-y-0.5 pl-5">{entry.description.split(/\n+/).map((line) => line.replace(/^[•·\-*]\s*/, "").trim()).filter(Boolean).map((line, bulletIndex) => <li key={bulletIndex}>{line}</li>)}</ul>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}
