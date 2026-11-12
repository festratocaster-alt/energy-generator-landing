"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleCheck, LoaderCircle, Mail, Menu, Phone, ShieldCheck, X } from "lucide-react";
import ProofStats from "./proof-stats";
import useScrollReveal from "./use-scroll-reveal";

const products = [
  { id: "canopy", name: "В кожухе", tag: "КОМПАКТНОЕ РЕШЕНИЕ", title: ["Готов к работе.", "Удобен в обслуживании."], image: "/assets/img/gs-kozhuh.jpg", text: "Шумозащитный кожух с сервисными дверями. Для резервного и автономного электроснабжения, когда важны компактность и доступ к оборудованию.", features: ["Заводская шумоизоляция", "Подогрев охлаждающей жидкости", "Контроллер с русским интерфейсом"], note: "Мощность и двигатель подбираем под нагрузку" },
  { id: "container", name: "В контейнере", tag: "ДЛЯ СЛОЖНЫХ УСЛОВИЙ", title: ["Собственный контейнер.", "Под условия вашего объекта."], image: "/assets/img/gs-cont.jpg", text: "Блок-контейнеры собственного производства с утеплением, вентиляцией и системами безопасности. Для промышленности и удалённых объектов.", features: ["Утепление по условиям эксплуатации", "Индивидуальное проектирование", "Доступ к узлам для обслуживания"], note: "Комплектацию и температурное исполнение уточним по ТЗ" },
  { id: "trailer", name: "На шасси", tag: "ЭНЕРГИЯ В ДВИЖЕНИИ", title: ["Один генератор.", "Разные площадки."], image: "/assets/img/gs-shassi.jpg", text: "Мобильная установка на прицепном шасси для задач, где генератор нужно перевозить между объектами: стройплощадки, выездные и временные работы.", features: ["Исполнение на прицепном шасси", "Шумозащитный кожух", "Доступ для сервисного обслуживания"], note: "Подберём установку и исполнение под ваш сценарий" },
];

const cases = [
  { image: "/assets/img/prj-stek.jpg", sector: "ЦЕНТР ОБРАБОТКИ ДАННЫХ", metric: "2 МВт", title: "Резервное питание для ЦОД", task: "Организовать резервное электроснабжение центра обработки данных.", solution: "4 ДГУ Iveco по 500 кВт в контейнерах УБК «Север» с утеплением 100 мм.", result: "Оборудованы АВР, диспетчеризация и автоматическое пожаротушение.", extra: "В состав проекта также вошли 5 контейнеров для аппаратной, шкаф общих шин и устройство компенсации реактивной мощности." },
  { image: "/assets/img/prj-agro.jpg", sector: "СЕЛЬСКОЕ ХОЗЯЙСТВО", metric: "2,9 МВт", title: "Энергокомплекс для агропредприятия", task: "Спроектировать и реализовать систему энергоснабжения предприятия.", solution: "5 ДГУ Baudouin в морозостойких контейнерах «Север» собственного производства.", result: "Изготовлены установки, блок-контейнеры и шкафы АВР.", extra: "Мощности установок: 1 000, 800, 800, 200 и 100 кВт. Контейнеры с утеплением 50 мм." },
  { image: "/assets/img/prj-hv.jpg", sector: "ПРОМЫШЛЕННОЕ РЕШЕНИЕ", metric: "2 МВт", title: "Высоковольтная станция ENERGY", task: "Подготовить высоковольтную электростанцию на 10 кВ.", solution: "ENERGY на базе двигателя SME по лицензионной технологии Mitsubishi Heavy Industries.", result: "Станция размещена в УБК-10 с двумя изолированными отсеками.", extra: "Альтернатор Mecc Alte, контроллер ComAp, бак 3 000 л. Габариты контейнера: 10 000 × 3 200 × 3 350 мм." },
];

const faqs = [
  ["Не знаю нужную мощность. С чего начать?", "Расскажите, что нужно запитать: перечислите оборудование, режим работы и условия на объекте. Если есть техническое задание, укажите это в заявке. Инженер уточнит нагрузки и поможет выбрать установку."],
  ["Можно ли заказать генератор с АВР?", "Компания реализует проекты со шкафами автоматического ввода резерва. Необходимость АВР, схему подключения и комплектацию определяем по задаче объекта."],
  ["Как выбрать между кожухом и контейнером?", "Кожух подходит, когда важны компактность и снижение шума. Контейнер позволяет учесть климат, разместить дополнительные системы и организовать доступ для обслуживания. Исполнение подбираем по месту установки и условиям эксплуатации."],
  ["От чего зависят цена и срок поставки?", "От мощности, двигателя, исполнения и дополнительного оборудования, а также наличия выбранной установки. Актуальную стоимость, наличие, сроки и условия гарантии уточняем при подготовке предложения."],
  ["Помогаете с запуском и обслуживанием?", "Компания выполняет пусконаладку, ремонт и техническое обслуживание. Есть собственная сервисная база и склад запчастей. Состав работ и условия выезда согласовываются для конкретного объекта."],
];

type ContactMethod = "phone" | "email" | "telegram";
function track(event: string, extra: Record<string, string> = {}) {
  const w = window as Window & { dataLayer?: Record<string, unknown>[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ event, ...extra });
}

export default function Home({ leadEndpoint = "/api/leads" }: { leadEndpoint?: string } = {}) {
  useScrollReveal();
  const [active, setActive] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selection, setSelection] = useState("Помогите выбрать исполнение");
  const [method, setMethod] = useState<ContactMethod>("phone");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [contactInvalid, setContactInvalid] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const startTime = useRef(0);
  const requestId = useRef("");
  const sending = useRef(false);
  const firstTouch = useRef<Record<string, string>>({});
  const product = products[active];

  useEffect(() => {
    startTime.current = Date.now();
    requestId.current = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid", "gclid"].forEach(k => { const v = params.get(k); if (v) utm[k] = v.slice(0, 120); });
    try {
      const saved = sessionStorage.getItem("energy-first-touch");
      if (Object.keys(utm).length || !saved) sessionStorage.setItem("energy-first-touch", JSON.stringify(utm));
      firstTouch.current = Object.keys(utm).length ? utm : JSON.parse(saved || "{}");
    } catch { firstTouch.current = utm; }
  }, []);

  useEffect(() => {
    const target = document.getElementById("request");
    if (!target) return;
    const observer = new IntersectionObserver(entries => setFormVisible(entries[0].isIntersecting), { threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  function choose(name: string, source: string) {
    setSelection(name); setMenuOpen(false);
    track("lead_cta_click", { placement: source, generator: name });
    document.getElementById("request")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (sending.current || status === "success") return;
    const form = e.currentTarget; if (!form.reportValidity()) return;
    const f = new FormData(form), contact = String(f.get("contact") || "").trim(), digits = contact.replace(/\D/g, "");
    const validPhone = /^\+?[\d ()-]+$/.test(contact) && digits.length >= 10 && digits.length <= 15;
    if ((method === "phone" && !validPhone) || (method === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) || (method === "telegram" && !/^@[A-Za-z0-9_]{5,32}$/.test(contact) && !validPhone)) {
      setError(method === "telegram" ? "Укажите @username (от 5 символов) или номер телефона." : method === "email" ? "Проверьте адрес электронной почты." : "Укажите номер телефона с кодом страны.");
      setContactInvalid(true); setStatus("error"); form.querySelector<HTMLInputElement>("[name=contact]")?.focus(); return;
    }
    sending.current = true; setContactInvalid(false); setStatus("sending"); setError("");
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 18000);
    let apiError = "";
    try {
      const response = await fetch(leadEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ requestId: requestId.current, contact, method, name: f.get("name"), task: f.get("task"), generator: selection, consent: f.get("consent") === "on", website: f.get("website"), startedAt: startTime.current, page: window.location.href.split("#")[0], referrer: document.referrer, utm: firstTouch.current }) });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!response.ok || data.ok !== true) { apiError = typeof data.message === "string" ? data.message : "Не удалось подтвердить отправку. Попробуйте позже или позвоните нам."; throw new Error("delivery_failed"); }
      setStatus("success"); track("lead_sent", { generator: selection, contact_method: method });
    } catch {
      setError(apiError || "Не удалось подтвердить доставку заявки. Попробуйте позже или свяжитесь с нами по телефону.");
      setStatus("error"); track("lead_error");
    } finally { clearTimeout(timeout); sending.current = false; }
  }

  return <>
    <a className="skip-link" href="#main">К содержимому</a>
    <div className="topbar"><div className="wrap topbar-inner"><span><i /> Россия и Казахстан</span><span>Оборудование. Поставка. Сервис.</span><a href="mailto:zakaz@generator-energy.ru">zakaz@generator-energy.ru <ArrowUpRight size={12} /></a></div></div>
    <header className="header"><div className="wrap header-inner">
      <a className="brand" href="#" aria-label="Энерджи Групп, на главную"><img src="/assets/logo.svg" alt="ЭНЕРДЖИ" width="182" height="62" /><span>ДИЗЕЛЬНЫЕ ГЕНЕРАТОРЫ</span></a>
      <nav className={menuOpen ? "nav open" : "nav"} aria-label="Основная навигация"><a href="#generators" onClick={() => setMenuOpen(false)}>Генераторы</a><a href="#projects" onClick={() => setMenuOpen(false)}>Наши проекты</a><a href="#company" onClick={() => setMenuOpen(false)}>О компании</a></nav>
      <div className="header-contact"><a href="tel:+79672462656">+7 (967) 246-26-56</a><span>Подбор и консультация</span></div>
      <button className="button small header-cta" onClick={() => choose("Помогите выбрать исполнение", "header")}>Подобрать ДГУ <ArrowUpRight size={17} /></button>
      <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={menuOpen}>{menuOpen ? <X /> : <Menu />}</button>
    </div></header>
    <main id="main">
      <section className="hero"><div className="wrap hero-grid">
        <div className="hero-copy"><div className="eyebrow"><span className="yellow-line" /> СОБСТВЕННЫЙ БРЕНД ENERGY</div><h1>Дизельные<br />генераторы <span>ENERGY</span><br />под вашу задачу</h1><p className="hero-description">Для резерва и постоянного электроснабжения.<br className="desktop-break" /> Подберём мощность, двигатель и исполнение.<br className="desktop-break" /> Поставим, запустим и поможем с обслуживанием.</p><button className="button primary-cta" onClick={() => choose("Помогите выбрать исполнение", "hero")}>Подобрать генератор и получить стоимость <ArrowUpRight size={21} /></button><div className="hero-note"><ShieldCheck size={17} /> От подбора до сервисной поддержки</div></div>
        <div className="hero-visual"><div className="visual-grid" /><span className="visual-index">ЭНЕРГИЯ ДЛЯ ВАШЕГО БИЗНЕСА</span><div className="energy-disc" /><div className="disc-label">ENERGY</div><img className="hero-generator" src="/assets/img/gs-kozhuh.jpg" alt="Дизельный генератор ENERGY в белом шумозащитном кожухе" width="1536" height="1024" fetchPriority="high" /><span className="visual-caption"><span className="caption-dot" /> Шумозащитный кожух</span><a className="visual-link" href="#generators">Найти своё исполнение <ArrowDown size={16} /></a><span className="visual-corner" /></div>
      </div></section>
      <ProofStats />
      <section className="section products-section" id="generators"><div className="wrap">
        <div className="section-heading"><div><div className="eyebrow">01 / ОБОРУДОВАНИЕ</div><h2>Одна задача.<br /><span className="muted">Ваше исполнение.</span></h2></div><p>Условия на объектах разные.<br />Подберём генератор, который им соответствует.</p></div>
        <div className="product-tabs" role="tablist" aria-label="Исполнение генератора">{products.map((p, i) => <button key={p.id} role="tab" id={`tab-${p.id}`} aria-controls={`panel-${p.id}`} aria-selected={i === active} tabIndex={i === active ? 0 : -1} onClick={() => {setActive(i); track("generator_view", { generator: p.name });}} onKeyDown={e => {if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {e.preventDefault(); const n=e.key==="Home"?0:e.key==="End"?2:(active+(e.key==="ArrowRight"?1:2))%3;setActive(n);document.getElementById(`tab-${products[n].id}`)?.focus();}}}><span>0{i+1}</span>{p.name}<ArrowUpRight size={18} /></button>)}</div>
        <div className="product-panel" role="tabpanel" id={`panel-${product.id}`} aria-labelledby={`tab-${product.id}`} key={product.id}><div className="product-image"><span className="equipment-label">ENERGY / {product.name.toUpperCase()}</span><img src={product.image} alt={`Дизельный генератор ENERGY ${product.name.toLowerCase()}`} width="800" height="500" loading="lazy" /><span className="image-footnote">Фотография оборудования ENERGY</span></div><div className="product-copy"><div className="eyebrow">{product.tag}</div><h3>{product.title.map(line=><span key={line}>{line}<br /></span>)}</h3><p>{product.text}</p><ul>{product.features.map(f=><li key={f}><Check size={16} />{f}</li>)}</ul><button className="button" onClick={()=>choose(product.name,"product")}>Подобрать в этом исполнении <ArrowUpRight size={19}/></button><small>{product.note}</small></div></div>
        <div className="selection-hint"><span className="hint-symbol">?</span><div><b>Не знаете, с чего начать?</b><span>Достаточно рассказать, что нужно запитать. С остальным поможем.</span></div><button onClick={()=>choose("Помогите выбрать исполнение","selection-help")}>Обсудить задачу <ArrowRight size={18}/></button></div>
      </div></section>
      <section className="section projects-section" id="projects"><div className="wrap"><div className="section-heading"><div><div className="eyebrow">02 / РЕАЛИЗОВАННЫЕ ПРОЕКТЫ</div><h2>За каждым проектом<br /><span className="muted">реальная работа.</span></h2></div><p>От резервного питания ЦОД<br />до промышленного энергокомплекса.</p></div><div className="cases-grid">{cases.map((c,i)=><article className="case" key={c.title}><div className="case-image"><img src={c.image} alt={c.title} width="600" height="420" loading="lazy"/><span>{c.metric}</span><small>0{i+1}</small></div><div className="case-content"><span className="eyebrow">{c.sector}</span><h3>{c.title}</h3><dl><div><dt>Задача</dt><dd>{c.task}</dd></div><div><dt>Решение</dt><dd>{c.solution}</dd></div><div><dt>Результат</dt><dd>{c.result}</dd></div></dl><details><summary>Детали проекта <ChevronDown size={17}/></summary><p>{c.extra}</p><a href="https://energy-generator.com/#p-sales" target="_blank" rel="noopener noreferrer">Проект на сайте компании <ArrowUpRight size={14}/></a></details></div></article>)}</div><p className="cases-note">В проектах используются разные двигатели и комплектации. Подберём решение под ваш объект.</p></div></section>
      <section className="company-section" id="company"><div className="wrap company-grid"><div className="company-photos"><img src="/assets/img/dir-production.webp" alt="Производство блок-контейнеров ENERGY" width="760" height="570" loading="lazy"/><div className="production-caption"><span className="caption-dot"/> Собственное производство · Татарстан</div><div className="production-number"><b>2 500</b><span>м² производства</span></div></div><div className="company-copy"><div className="eyebrow">03 / ОДНА КОМАНДА НА ВСЕХ ЭТАПАХ</div><h2>Знаем оборудование.<br /><span>Отвечаем за работу.</span></h2><p className="company-intro">Энерджи Групп поставляет генераторы, производит блок-контейнеры и обслуживает оборудование. Поэтому мы видим задачу целиком.</p><div className="company-points"><div><span>01</span><div><h3>Своё производство</h3><p>Конструкторский отдел, металлообработка, сварка и окраска на одной площадке.</p></div></div><div><span>02</span><div><h3>Проверяем перед передачей</h3><p>Нагрузочные испытания установок ENERGY с перегрузкой 110% и видеоотчёт.</p></div></div><div><span>03</span><div><h3>Поддерживаем после запуска</h3><p>Сервисная база, склад запчастей, ремонт и техническое обслуживание в России и Казахстане.</p></div></div></div></div></div></section>
      <section className="section process-section"><div className="wrap"><div className="section-heading"><div><div className="eyebrow">04 / ПОНЯТНЫЙ ПРОЦЕСС</div><h2>От задачи до запуска.</h2></div><p>Состав работ и условия<br />фиксируем в предложении.</p></div><div className="process-grid">{[["Разбираемся в задаче","Уточняем нагрузки, режим работы, место установки и условия эксплуатации."],["Подбираем решение","Определяем мощность, двигатель, исполнение и необходимые опции."],["Готовим предложение","Уточняем комплектацию, стоимость, наличие, сроки и условия поставки."],["Поставляем и запускаем","Согласовываем доставку, пусконаладку и дальнейшее обслуживание."]].map(([title,text],i)=><div className="process-item" key={title}><div className="step-top"><span>0{i+1}</span>{i<3&&<ArrowRight size={20}/>}</div><h3>{title}</h3><p>{text}</p></div>)}</div></div></section>
      <section className="section faq-section"><div className="wrap faq-grid"><div><div className="eyebrow">05 / ДО ОБРАЩЕНИЯ</div><h2>Вопросы,<br /><span className="muted">которые важны.</span></h2><p>Нужна консультация по вашему объекту?<br /><a className="inline-phone" href="tel:+79672462656">+7 (967) 246-26-56 <ArrowUpRight size={17}/></a></p></div><div className="faq-list">{faqs.map(([q,a])=><details key={q}><summary>{q}<span><ChevronDown size={19}/></span></summary><p>{a}</p></details>)}</div></div></section>
      <section className="request-section" id="request"><div className="wrap request-grid"><div className="request-copy"><div className="eyebrow"><span className="yellow-line"/> ПОДБЕРЁМ РЕШЕНИЕ ДЛЯ ВАС</div><h2>Начнём<br />с вашей <span>задачи.</span></h2><p>Оставьте контакт. Уточним детали и подготовим предложение по генератору ENERGY.</p><ul><li><Check size={18}/>Подбор мощности и исполнения</li><li><Check size={18}/>Комплектация под условия объекта</li><li><Check size={18}/>Актуальная стоимость и сроки</li></ul><div className="request-direct"><span>Или свяжитесь с нами напрямую</span><a href="tel:+79672462656"><Phone size={17}/>+7 (967) 246-26-56</a><a href="mailto:zakaz@generator-energy.ru"><Mail size={17}/>zakaz@generator-energy.ru</a></div></div>
        <div className="form-card">{status==="success"?<div className="form-success" role="status"><CircleCheck size={54}/><h3>Заявка доставлена</h3><p>Спасибо! Свяжемся с вами по указанному контакту и уточним задачу.</p><a href="#generators" className="button secondary">Вернуться к генераторам <ArrowUpRight size={18}/></a></div>:<form onSubmit={submit} method="post" action={leadEndpoint}><div className="form-title"><h3>Подбор и стоимость</h3><span>ENERGY</span></div><p className="form-subtitle">Можно начать с одного контакта.</p>
          <div className="field-label" id="method-label">Удобный способ связи <span>*</span></div><div className="contact-methods" role="group" aria-labelledby="method-label">{([['phone','Телефон'],['email','Почта'],['telegram','Telegram']] as const).map(([id,label])=><button key={id} type="button" aria-pressed={method===id} className={method===id?"selected":""} onClick={()=>{setMethod(id);setStatus("idle");setContactInvalid(false);setError("");}}>{label}</button>)}</div>
          <label className="sr-only" htmlFor="contact">{method==="phone"?"Номер телефона":method==="email"?"Электронная почта":"Контакт в Telegram"}</label><input id="contact" key={method} name="contact" type={method==="email"?"email":method==="phone"?"tel":"text"} placeholder={method==="phone"?"+7 (___) ___-__-__":method==="email"?"name@company.ru":"@username или +7..."} autoComplete={method==="phone"?"tel":method==="email"?"email":"off"} required maxLength={160} aria-invalid={contactInvalid} aria-describedby={status==="error"?"form-error":undefined}/>
          <label className="field-label" htmlFor="name">Имя или компания <small>необязательно</small></label><input id="name" name="name" placeholder="Как к вам обращаться" autoComplete="organization" maxLength={120}/>
          <label className="field-label" htmlFor="generator">Исполнение</label><div className="select-wrap"><select id="generator" value={selection} onChange={e=>setSelection(e.target.value)}><option value="Помогите выбрать исполнение">Помогите выбрать</option>{products.map(p=><option key={p.id}>{p.name}</option>)}</select><ChevronDown size={17}/></div>
          <label className="field-label" htmlFor="task">Задача или мощность <small>необязательно</small></label><textarea id="task" name="task" placeholder="Например: резервное питание производства, 100 кВт, Казань" rows={3} maxLength={1000}/>
          <div className="honeypot" aria-hidden="true"><label htmlFor="website">Ваш сайт</label><input id="website" name="website" tabIndex={-1} autoComplete="off"/></div>
          <label className="consent"><input name="consent" type="checkbox" required/><span>Я согласен на обработку персональных данных в соответствии с <a href="https://generator-energy.ru/policy/" target="_blank" rel="noopener noreferrer">политикой конфиденциальности</a>.</span></label>
          {status==="error"&&<p className="form-error" id="form-error" role="alert">{error}</p>}
          <button className="button form-submit" disabled={status==="sending"} type="submit">{status==="sending"?<>Отправляем заявку <LoaderCircle className="spin" size={20}/></>:<>Подобрать генератор и получить стоимость <ArrowUpRight size={20}/></>}</button><p className="form-footnote"><ShieldCheck size={14}/> Используем контакт для ответа на вашу заявку</p>
        </form>}</div>
      </div></section>
    </main>
    <footer className="footer"><div className="wrap"><div className="footer-main"><div className="footer-brand"><img src="/assets/logo-white.svg" alt="ЭНЕРДЖИ" width="190" height="64"/><p>Энергия. В любое время.<br/>В любом месте.</p><a href="https://energy-generator.com" target="_blank" rel="noopener noreferrer">Основной сайт <ArrowUpRight size={15}/></a></div><div><span className="footer-label">РОССИЯ</span><a className="footer-phone" href="tel:+79672462656">+7 (967) 246-26-56</a><a href="mailto:zakaz@generator-energy.ru">zakaz@generator-energy.ru</a><p>Республика Татарстан, Пестречинский р-н,<br/>д. Старое Кощаково, ул. Промпарковая, зд. 11</p></div><div><span className="footer-label">КАЗАХСТАН</span><a className="footer-phone" href="tel:+77770845425">+7 (777) 084-54-25</a><a href="mailto:zakaz@generator-energy.kz">zakaz@generator-energy.kz</a><p>Алматы, ул. Егизбаева, 13а,<br/>офис 406-408, 2 этаж</p></div></div><div className="footer-bottom"><span>© 2026 ООО «Энерджи Групп» · ИНН 1660333551<br/>ТОО «SILA ENERGY KZ» · БИН 220540032070</span><a href="https://generator-energy.ru/policy/" target="_blank" rel="noopener noreferrer">Политика конфиденциальности</a><a className="back-to-top" href="#">Наверх ↑</a></div></div></footer>
    <div className={formVisible ? "mobile-cta form-visible" : "mobile-cta"}><a href="tel:+79672462656" aria-label="Позвонить"><Phone size={21}/></a><button className="button" onClick={()=>choose("Помогите выбрать исполнение","mobile-sticky")}>Подобрать генератор <ArrowUpRight size={18}/></button></div>
  </>;
}
