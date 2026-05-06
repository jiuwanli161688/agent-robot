// 角色选项
export const industryOptions = [
  { value: "general", label: "🌍 全能助手" },
  { value: "beauty", label: "💄 美妆顾问" },
  { value: "outfit_trendsetter", label: "🧥 穿搭潮人" },
  { value: "senior_thesis_mentor", label: "🎓 大学生论文导师" },
  { value: "job_guidance_teacher", label: "🧑‍💼 大学生就业指导导师" },
  { value: "ecommerce", label: "🛒 电商运营顾问" },
  { value: "ecommerce_product_expert", label: "📦 商品选品专家" },
  { value: "fitness", label: "💪 健身教练" },
  { value: "fat_loss_coach", label: "🔥 减脂教练" },
  { value: "gymnastics_coach", label: "🎓 体操教练" },
  { value: "deco", label: "🏠 装修设计" },
  { value: "lawyer", label: "⚖️ 法律顾问" },
  { value: "junior_physics_teacher", label: "🎓 初中物理教师" },
  { value: "junior_chemistry_teacher", label: "🎓 初中化学老师" },
  { value: "senior_physics_teacher", label: "🎓 高中物理老师" },
  { value: "senior_chemistry_teacher", label: "🎓 高中化学老师" },
];

// 角色默认问题
export const defQuestionsByRole = {
  general: ["给我一个学习新技能的建议", "帮我写一份周目标清单", "如何科学提升工作效率？"],
  deco: ["两室一厅如何做收纳和动线优化？", "给我一个客厅软装配色方案", "列一个装修预算表（10 万/15 万）"],
  lawyer: ["帮我梳理这份合同的风险点", "劳动仲裁一般流程与材料清单？", "我这种情况是否构成违约/侵权？"],
  ecommerce: ["给我一个店铺 7 天提升转化的方案", "如何优化详情页结构提高下单？", "做一份活动节奏与投放建议"],
  ecommerce_product_expert: ["给我 3 个适合新手的选品方向", "如何用数据判断一个品是否能做？", "帮我写一个竞品分析框架"],
  beauty: [
    "按我的肤质/肤色/预算/通勤场景，给一套“底妆-眉眼-唇颊”清单（含色号思路与平替）",
    "我想画干净高级的伪素颜：请给步骤+用量+手法，并标注新手最容易翻车的 3 个点",
    "对比这两款底妆：按遮瑕/持妆/控油/氧化/适合肤质打分，并给我的选择建议与上妆组合",
  ],
  outfit_trendsetter: [
    "按我的身高体重/体型特点/风格偏好/预算，做一份 7 天通勤穿搭（每天：上衣-下装-鞋包-配饰）",
    "我有这件单品（发图/描述）：请给 3 套不同风格搭配，并说明配色、版型、场合与显高显瘦理由",
    "帮我做一个“胶囊衣橱”清单（通勤/周末/约会），并给 10 套可复用搭配公式",
  ],
  fitness: ["为我制定一周增肌训练计划", "深蹲动作要点与常见错误", "如何安排训练与睡眠恢复？"],
  fat_loss_coach: ["给我一个 14 天减脂计划（饮食+训练）", "我该怎么计算热量缺口？", "平台期怎么突破？"],
  gymnastics_coach: ["帮我设计一节 45 分钟体操基础课", "倒立训练循序渐进怎么做？", "柔韧训练要注意什么？"],
  senior_thesis_mentor: ["帮我确定论文选题并给研究问题", "写一份开题报告大纲", "如何搭建文献综述结构？"],
  job_guidance_teacher: ["帮我优化简历（STAR 法则）", "模拟一轮面试并给反馈", "给我一份求职时间线与行动清单"],
  junior_physics_teacher: ["讲解这道题并给 3 个同类练习", "帮我出一份小测（选择+计算）", "如何用生活例子讲‘力与运动’？"],
  junior_chemistry_teacher: ["总结本章知识点并做思维导图提纲", "出 10 道基础题（含答案）", "如何区分常见化学反应类型？"],
  senior_physics_teacher: ["用更严谨的方法讲这道电磁题", "给我一套高考风格练习（含解析）", "如何构建受力分析模板？"],
  senior_chemistry_teacher: ["帮我梳理有机推断常用突破口", "出一套选择题训练（含解析）", "电化学常见坑点总结"],
};

export const getDefaultQuestions = (role) => {
  const key = typeof role === "string" ? role : "general";
  return defQuestionsByRole[key] || defQuestionsByRole.general || [];
};