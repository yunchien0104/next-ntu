"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FeatureHeader } from "@/components/ui/FeatureHeader";
import { Field, inputClass, Modal } from "@/components/ui/Modal";
import { initialTalents } from "@/lib/data";
import type { Talent } from "@/lib/types";

const fields = ["全部領域", "科技與軟體", "資料與 AI", "產品與設計", "金融與投資", "顧問與策略", "行銷與品牌", "法律與公共政策", "教育與研究", "新創與創業", "媒體與創意", "製造與供應鏈", "永續與社會影響"];
const levels = ["大一", "大二", "大三", "大四", "碩博士", "畢業"];

interface ProfileForm { name: string; department: string; level: string; field: string; graduation: string; linkedIn: string; response: "active" | "later"; intro: string; avatar: string }
const emptyProfile: ProfileForm = { name: "", department: "", level: "", field: "", graduation: "", linkedIn: "", response: "active", intro: "", avatar: "" };

export function TalentPage({ notify, onCoffee }: { notify: (message: string) => void; onCoffee: (name: string) => void }) {
  const [talents, setTalents] = useState<Talent[]>(initialTalents);
  const [search, setSearch] = useState("");
  const [field, setField] = useState("全部領域");
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [roleOnly, setRoleOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile);
  const avatarRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => talents.filter((talent) => {
    const text = `${talent.name} ${talent.meta} ${talent.field} ${talent.bio}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (field === "全部領域" || talent.field === field) && (!selectedLevels.length || selectedLevels.includes(talent.level)) && (!selectedGenders.length || selectedGenders.includes(talent.gender)) && (!roleOnly || talent.roleModel);
  }), [field, roleOnly, search, selectedGenders, selectedLevels, talents]);

  function toggleFilter(value: string, values: string[], update: (values: string[]) => void) {
    update(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  function clearFilters() {
    setSearch(""); setField("全部領域"); setSelectedLevels([]); setSelectedGenders([]); setRoleOnly(false);
  }

  function editProfile() {
    const self = talents.find((talent) => talent.id === "self");
    setProfile(self ? { name: self.name, department: self.meta.split(" · ").at(-1) || "", level: self.level, field: self.field, graduation: "", linkedIn: "", response: self.response, intro: self.bio, avatar: "" } : { ...emptyProfile, name: "游同學", department: "資訊管理學系", level: "大三", field: "資料與 AI", intro: "想聊資料實習、跨域學習與 AI 產品。" });
    setModalOpen(true);
  }

  function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return notify("大頭照請小於 2 MB");
    const reader = new FileReader();
    reader.onload = () => setProfile((value) => ({ ...value, avatar: String(reader.result || "") }));
    reader.readAsDataURL(file);
  }

  function saveProfile() {
    if (!profile.name.trim()) return notify("請填寫顯示名稱");
    if (profile.linkedIn && !/^https?:\/\//i.test(profile.linkedIn)) return notify("LinkedIn 連結請以 https:// 開頭");
    const initials = (profile.name.match(/\b[A-Za-z]/g) || [...profile.name]).slice(0, 2).join("").toUpperCase();
    const self: Talent = { id: "self", initials, name: profile.name.trim(), meta: `${profile.graduation ? `${profile.graduation} 畢業` : profile.level} · ${profile.department}`, field: profile.field || "探索中", level: profile.level || "畢業", gender: "", bio: profile.intro, tags: [profile.field || "探索中", "我的頁面"], response: profile.response };
    setTalents((items) => [self, ...items.filter((item) => item.id !== "self")]);
    setModalOpen(false); notify("你的人才頁面已儲存");
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)]">
      <FeatureHeader eyebrow="PEOPLE DIRECTORY" title="人才庫" description="找到能回答下一個問題的人，建立低壓力、有目的的連結。" actions={<Button className={roleOnly ? "border-[var(--paper)] bg-[var(--panel-2)]" : ""} onClick={() => setRoleOnly((value) => !value)}>我的 Role Models</Button>} />
      <div className="grid lg:grid-cols-[250px_1fr]">
        <aside className="border-b border-[var(--line)] bg-[var(--panel)] p-5 lg:min-h-[720px] lg:border-r lg:border-b-0">
          <label className="grid gap-2 text-xs"><span className="font-semibold">領域</span><select className={inputClass} value={field} onChange={(event) => setField(event.target.value)}>{fields.map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className="mt-6"><h3 className="text-xs font-semibold">年級／狀態</h3><div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">{levels.map((level) => <label key={level} className="flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={selectedLevels.includes(level)} onChange={() => toggleFilter(level, selectedLevels, setSelectedLevels)} />{level}</label>)}</div></div>
          <div className="mt-6"><h3 className="text-xs font-semibold">性別</h3><div className="mt-3 flex gap-5 lg:grid lg:gap-2">{["男", "女"].map((gender) => <label key={gender} className="flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={selectedGenders.includes(gender)} onChange={() => toggleFilter(gender, selectedGenders, setSelectedGenders)} />{gender}</label>)}</div></div>
          <Button full className="mt-7" onClick={clearFilters}>清除篩選</Button>
        </aside>
        <section className="p-4 md:p-7">
          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]"><input className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋人才庫：姓名、系所、領域或經歷" /><Button variant="primary" onClick={() => { setProfile(emptyProfile); setModalOpen(true); }}>加入人才庫</Button><Button onClick={editProfile}>修改我的頁面</Button></div>
          <div className="my-4 flex justify-between text-[10px] text-[var(--muted)]"><span>找到 {visible.length} 位學長姊與同學</span><span>依共同背景與回覆意願排序</span></div>
          <div className="grid gap-3 xl:grid-cols-2">
            {visible.map((talent) => (
              <article key={talent.id} className="border border-[var(--line)] bg-[var(--panel)] p-5 animate-rise">
                <div className="flex items-center gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center border border-[var(--line-strong)] text-xs font-bold">{talent.initials}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{talent.name}</h2><span className={`border px-1.5 py-0.5 text-[8px] ${talent.response === "later" ? "border-[#555] text-[var(--muted)]" : "border-[#888] text-[var(--soft)]"}`}>{talent.response === "later" ? "較晚回覆" : "積極回覆中"}</span></div><div className="mt-0.5 text-[10px] text-[var(--muted)]">{talent.meta}</div></div></div>
                <p className="my-4 text-xs leading-6 text-[var(--soft)]">{talent.bio}</p>
                <div className="flex flex-wrap gap-1.5">{talent.tags.map((tag) => <span key={tag} className="border border-[var(--line)] px-2 py-1 text-[9px] text-[var(--muted)]">{tag}</span>)}</div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4"><Button variant="primary" onClick={() => onCoffee(talent.name)}>coffee chat invitation</Button><Button onClick={() => notify(`已開啟與 ${talent.name} 的對話`)}>聊聊</Button><Button className={talent.roleModel ? "border-[var(--paper)]" : ""} onClick={() => { setTalents((items) => items.map((item) => item.id === talent.id ? { ...item, roleModel: !item.roleModel } : item)); notify(talent.roleModel ? "已移除 Role Model" : "已加入 Role Models"); }}>{talent.roleModel ? "✓ 我的 Role model" : "＋ Role model"}</Button></div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <Modal open={modalOpen} title={talents.some((talent) => talent.id === "self") ? "修改我的頁面" : "加入人才庫"} onClose={() => setModalOpen(false)} footer={<><Button onClick={() => setModalOpen(false)}>取消</Button><Button variant="primary" onClick={saveProfile}>儲存頁面</Button></>} wide>
        <div className="flex items-center gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden border border-[var(--line-strong)] text-lg font-bold">{profile.avatar ? <img className="h-full w-full object-cover" src={profile.avatar} alt="大頭照預覽" /> : (profile.name || "YC").slice(0, 2).toUpperCase()}</div><div><input ref={avatarRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} /><Button onClick={() => avatarRef.current?.click()}>上傳大頭照</Button><p className="mt-2 text-[10px] text-[var(--muted)]">支援 JPG、PNG、WebP；此原型只儲存在你的瀏覽器。</p></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="顯示名稱"><input className={inputClass} value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="你的名字或暱稱" /></Field><Field label="系所"><input className={inputClass} value={profile.department} onChange={(event) => setProfile({ ...profile, department: event.target.value })} placeholder="例如：資訊管理學系" /></Field><Field label="年級／狀態"><input className={inputClass} value={profile.level} onChange={(event) => setProfile({ ...profile, level: event.target.value })} placeholder="大三、碩二或 2024 畢業" /></Field><Field label="領域"><input className={inputClass} value={profile.field} onChange={(event) => setProfile({ ...profile, field: event.target.value })} placeholder="資料與 AI" /></Field><Field label="畢業年份（選填）"><input className={inputClass} type="number" value={profile.graduation} onChange={(event) => setProfile({ ...profile, graduation: event.target.value })} placeholder="2028" /></Field><Field label="回覆狀態"><select className={inputClass} value={profile.response} onChange={(event) => setProfile({ ...profile, response: event.target.value as "active" | "later" })}><option value="active">積極回覆中</option><option value="later">較晚回覆</option></select></Field></div>
        <Field label="LinkedIn 連結"><input className={inputClass} type="url" value={profile.linkedIn} onChange={(event) => setProfile({ ...profile, linkedIn: event.target.value })} placeholder="https://www.linkedin.com/in/yourname" /></Field>
        <Field label="想和大家聊什麼？"><input className={inputClass} value={profile.intro} onChange={(event) => setProfile({ ...profile, intro: event.target.value })} placeholder="簡短描述可分享的經驗" /></Field>
      </Modal>
    </main>
  );
}
