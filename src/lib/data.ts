import type { CalendarEvent, Post, ResumeData, Talent, TodoItem } from "./types";

export const initialTodos: TodoItem[] = [
  { id: "cv", title: "完成英文履歷初稿", due: "10/12 · 6 天", tag: "履歷", done: false, urgent: true },
  { id: "tsmc", title: "投遞台積電暑期實習", due: "10/18 · 12 天", tag: "實習", done: false, urgent: true },
  { id: "prof", title: "整理 3 位教授的研究方向", due: "10/25", tag: "研究所", done: false },
  { id: "coffee", title: "約 1 位學長姊 coffee chat", due: "10/30", tag: "人脈", done: false },
  { id: "club", title: "參加 DSA 社課說明會", due: "已完成", tag: "社團", done: true },
];

export const historyFolders = [
  ["大一 · 探索", "選課、學習方法、校園資源", "08"],
  ["大二 · 延伸", "社團、學程、專題方向", "11"],
  ["大三 · 聚焦", "實習、研究所、coffee chat", "14"],
  ["大四 · 轉換", "求職、畢業、職涯選擇", "03"],
];

export const historyQuestions = [
  ["實習與研究所要怎麼雙軌準備？", "今天 · 大三"],
  ["資料分析實習最近有哪些機會？", "昨天 · 大三"],
  ["該怎麼邀請學長姊 coffee chat？", "10/02 · 大三"],
  ["資管系選課如何安排比較彈性？", "09/21 · 大二"],
  ["跨領域學程有哪些選項？", "09/10 · 大二"],
];

export const initialCalendarEvents: CalendarEvent[] = [
  { id: "seed-1", title: "英文履歷初稿", date: "2026-10-12", time: "18:00", guests: "", notes: "完成第一版並請同學 review", type: "career" },
  { id: "seed-2", title: "Coffee chat：資料產品", date: "2026-10-16", time: "14:00", guests: "mentor@gmail.com", notes: "準備三個職涯問題", type: "shared" },
  { id: "seed-3", title: "台積電實習截止", date: "2026-10-18", time: "23:00", guests: "", notes: "送出前再次確認附件", type: "career" },
];

export const initialPosts: Post[] = [
  {
    id: "post-1",
    category: "career",
    initials: "AL",
    author: "AL｜資管系校友",
    meta: "資料產品 · 2 小時前",
    title: "第一份資料實習，我會更早準備的三件事",
    copy: "不要只列工具。用一頁說清楚你處理了什麼問題、如何做取捨，以及結果改變了什麼。面試官真正想知道的是你的判斷過程。",
    likes: 42,
  },
  {
    id: "post-2",
    category: "graduate",
    initials: "CY",
    author: "青衍｜電機所碩二",
    meta: "研究生活 · 昨天",
    title: "找指導教授前，先問自己的四個問題",
    copy: "研究題目固然重要，但回饋頻率、實驗室文化與你期待的生活方式也同樣關鍵。把問題寫下來再去 coffee chat。",
    likes: 67,
  },
  {
    id: "post-3",
    category: "course",
    initials: "SN",
    author: "山寧｜外文系大四",
    meta: "跨域學習 · 3 天前",
    title: "非本科生怎麼開始學資料分析",
    copy: "先用一個自己真的在意的問題開始，比從語法章節一路讀完有效。我的第一個專案是分析校園活動資訊如何被錯過。",
    likes: 31,
  },
  {
    id: "post-4",
    category: "abroad",
    initials: "KL",
    author: "Kai｜國企系校友",
    meta: "海外職涯 · 5 天前",
    title: "交換不是空白年：如何留下可說的成果",
    copy: "除了修課，把跨文化合作、獨立解題與當地社群參與轉成具體故事，回來後不論求職或申請都更容易被理解。",
    likes: 54,
  },
];

export const initialTalents: Talent[] = [
  { id: "talent-1", initials: "JL", name: "林佳樂", meta: "2022 畢業 · 資訊管理學系", field: "資料與 AI", level: "畢業", gender: "女", bio: "資料產品經理，願意聊資料職涯、作品集與第一份實習選擇。", tags: ["資料與 AI", "產品", "校友"], response: "active" },
  { id: "talent-2", initials: "WC", name: "王承宇", meta: "大四 · 財務金融學系", field: "金融與投資", level: "大四", gender: "男", bio: "曾任投資研究實習生，關注科技產業與量化研究。", tags: ["金融與投資", "研究", "實習"], response: "later" },
  { id: "talent-3", initials: "YT", name: "唐予恬", meta: "2020 畢業 · 國際企業學系", field: "顧問與策略", level: "畢業", gender: "女", bio: "策略顧問，擅長 case interview、商業分析與跨國申請。", tags: ["顧問與策略", "商業分析"], response: "active" },
  { id: "talent-4", initials: "HC", name: "陳海川", meta: "碩二 · 資訊網路與多媒體所", field: "產品與設計", level: "碩博士", gender: "男", bio: "UX 研究與產品設計，喜歡把複雜流程做成清楚的工具。", tags: ["產品與設計", "UX Research"], response: "active" },
  { id: "talent-5", initials: "SH", name: "許思涵", meta: "大三 · 經濟學系", field: "新創與創業", level: "大三", gender: "女", bio: "校園新創共同創辦人，關注使用者訪談、成長與學生創業。", tags: ["新創與創業", "Growth"], response: "later" },
  { id: "talent-6", initials: "KP", name: "潘凱平", meta: "2023 畢業 · 社會學系", field: "永續與社會影響", level: "畢業", gender: "男", bio: "社會影響力顧問，熟悉非營利組織、ESG 與政策研究。", tags: ["永續與社會影響", "政策"], response: "active" },
];

export const defaultResumeData: ResumeData = {
  profile: {
    fullName: "YOUR NAME",
    cityCountry: "Taipei, Taiwan",
    phone: "09xx-xxx-xxx",
    email: "name@example.com",
    linkedIn: "",
  },
  sections: [
    {
      id: "education",
      title: "Education",
      type: "education",
      entries: [{ organization: "National Taiwan University", location: "Taipei, Taiwan", role: "Bachelor of Management in Information Management", startDate: "Sep 2024", endDate: "Jun 2028", description: "Relevant courses: Data Analysis, Statistics, Product Management" }],
    },
    {
      id: "professional",
      title: "Professional Experience",
      type: "experience",
      entries: [
        { organization: "Example Technology", location: "Taipei, Taiwan", role: "Data Analyst Intern", startDate: "Jun 2026", endDate: "Aug 2026", description: "Built a weekly product funnel dashboard and reduced manual reporting time by 40%.\nPartnered with product and marketing teams to define experiment metrics." },
        { organization: "Student Research Lab", location: "Taipei, Taiwan", role: "Research Assistant", startDate: "Jan 2026", endDate: "May 2026", description: "Analyzed survey data and summarized findings for a faculty research project." },
      ],
    },
    {
      id: "extracurricular",
      title: "Extracurricular Experience",
      type: "experience",
      entries: [{ organization: "NTU Data Analytics Club", location: "Taipei, Taiwan", role: "Project Lead", startDate: "Sep 2025", endDate: "Present", description: "Led a five-person team to analyze campus event discovery behavior.\nPresented recommendations to student organizers." }],
    },
    {
      id: "leadership",
      title: "Leadership Experience",
      type: "experience",
      entries: [{ organization: "College Student Association", location: "Taipei, Taiwan", role: "Head of Public Relations", startDate: "Sep 2024", endDate: "May 2025", description: "Hosted career development sessions with alumni speakers.\nCoordinated a corporate visit for 50 students." }],
    },
    {
      id: "skills",
      title: "Skills and Interests",
      type: "skills",
      entries: [
        { organization: "Techniques", location: "", role: "", startDate: "", endDate: "", description: "Python, SQL, Excel, Figma" },
        { organization: "Interests", location: "", role: "", startDate: "", endDate: "", description: "Product analytics, education technology, urban walking" },
      ],
    },
  ],
};
