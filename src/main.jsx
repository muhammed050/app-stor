import React, {
  useState,
  useEffect,
  useContext,
  createContext,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Layers,
  Wallet,
  ShieldCheck,
  ArrowUpLeft,
  ArrowLeft,
  ArrowDownLeft,
  Plus,
  Search,
  Bell,
  Menu,
  X,
  LogOut,
  Settings,
  LifeBuoy,
  Check,
  CheckCircle2,
  Clock,
  UploadCloud,
  Smartphone,
  Globe,
  ExternalLink,
  Users,
  FileCheck2,
  Activity,
  ChevronLeft,
  ChevronDown,
  Send,
  LockKeyhole,
  Copy,
  Download,
  AlertCircle,
  RefreshCw,
  Store,
  BriefcaseBusiness,
  CreditCard,
  Coins,
  ArrowRight,
  CheckCheck,
  FileText,
  Eye,
  SlidersHorizontal,
  TrendingUp,
  Mail,
  Shield,
  Code2,
} from "lucide-react";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./styles.css";
import "./design.css";
import { Brand, PublicPage, PublicFooter } from "./public-pages.jsx";
import { publicPages, origin as siteOrigin, pageSchema } from "../shared/seo.mjs";
import { cryptoMethods, enabledMethods, methodById, transactionUrl } from "../shared/crypto.mjs";
import { requestJson } from "./http.mjs";
const WhopEmbed = lazy(() =>
  import("@whop/checkout/react").then((m) => ({
    default: m.WhopCheckoutEmbed,
  })),
);
const Context = createContext(null);
const useApp = () => useContext(Context);
let csrf = "";
async function api(path, body) {
  return requestJson(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (n || 0) / 100,
  );
const date = (n) =>
  n
    ? new Intl.DateTimeFormat("ar", { dateStyle: "medium" }).format(new Date(n))
    : "—";
const form = (e) => Object.fromEntries(new FormData(e.currentTarget));
const statusNames = {
  reviewing: "قيد الفحص",
  open: "بانتظار ناشر",
  assigned: "جارٍ النشر",
  submitted: "بانتظار التحقق",
  verified: "مهلة الاعتراض",
  completed: "مكتمل",
  disputed: "نزاع مفتوح",
  cancelled: "ملغي",
  rejected: "مرفوض",
  pending: "قيد الانتظار",
  approved: "معتمد",
  paid: "تم التحويل",
  active: "نشط",
  suspended: "معلق",
  closed: "مغلق",
  failed: "تعذّر الدفع",
  creating: "تجهيز الدفع",
  refunded: "مسترد",
};
const roleNames = {
  client: "صاحب تطبيق",
  publisher: "شريك نشر",
  admin: "مدير المنصة",
};
function Link({ to, children, className = "", ...props }) {
  const { go } = useApp();
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          go(to);
        }
      }}
      {...props}
    >
      {children}
    </a>
  );
}
function Logo() { return <Brand Link={Link}/>; }
function Badge({ status, children }) {
  return (
    <span className={`badge ${status}`}>
      {children || statusNames[status] || status}
    </span>
  );
}
function Button({ children, icon: Icon, className = "", busy, ...props }) {
  return (
    <button
      className={`button ${className}`}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy ? (
        <RefreshCw size={17} className="spin" />
      ) : Icon ? (
        <Icon size={17} />
      ) : null}
      {children}
    </button>
  );
}
function Field({ label, children, hint, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />} {hint && <small>{hint}</small>}
    </label>
  );
}
function Empty({
  icon: Icon = Layers,
  title = "لا توجد بيانات بعد",
  text: detail,
  children,
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={29} />
      </span>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {children}
    </div>
  );
}
function Notice({ children, type = "info" }) {
  return (
    <div className={`notice ${type}`}>
      <AlertCircle size={19} />
      <div>{children}</div>
    </div>
  );
}
function Section({ title, subtitle, children, action, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Heading({ eyebrow, title, text: desc, action }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {action}
    </div>
  );
}
function Modal({ title, children, onClose }) {
  useEffect(() => {
    const old = document.body.style.overflow;
    const opener = document.activeElement;
    document.body.style.overflow = "hidden";
    const focusable = () => [
      ...document.querySelectorAll(
        ".modal button:not([disabled]), .modal input:not([disabled]), .modal select, .modal textarea, .modal a[href]",
      ),
    ];
    focusable()[0]?.focus();
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", handler);
      opener?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="modal">
        <div className="section-heading">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="إغلاق">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function ActionForm({ children, onSubmit, submit = "حفظ", className = "" }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { toast, refresh } = useApp();
  return (
    <form
      className={`form ${className}`}
      onSubmit={async (e) => {
        e.preventDefault();
        const b = form(e),
          element = e.currentTarget;
        setBusy(true);
        setError("");
        try {
          await onSubmit(b, { currentTarget: element });
          await refresh();
          toast("تم حفظ الإجراء بنجاح");
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && <Notice type="error">{error}</Notice>}
      <Button type="submit" busy={busy}>
        {submit}
        <ArrowLeft size={17} />
      </Button>
    </form>
  );
}
function App() {
  const [path, setPath] = useState(location.pathname),
    [user, setUser] = useState(null),
    [data, setData] = useState(null),
    [config, setConfig] = useState(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notification, setNotification] = useState("");
  const go = (p) => {
    history.pushState({}, "", p);
    setPath(p.split("?")[0]);
    window.scrollTo(0, 0);
    if (user) refresh().catch(() => {});
  };
  const refresh = async () => {
    const me = await api("/me");
    csrf = me.csrf || "";
    setUser(me.user);
    if (me.user) setData(await api("/state"));
    else setData(null);
  };
  const toast = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(""), 4500);
  };
  useEffect(() => {
    const pop = () => setPath(location.pathname);
    addEventListener("popstate", pop);
    Promise.all([refresh(), api("/config").then(setConfig)])
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => refresh().catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, [user?.id]);
  useEffect(() => {
    const meta = publicPages[path];
    document.title = meta?.title || `${path.startsWith("/admin") ? "الإدارة" : path === "/wallet" ? "المحفظة" : "مساحة العمل"} — Dorucenie`;
    const setMeta = (name, content, property = false) => {
      const attribute = property ? "property" : "name";
      let element = document.head.querySelector(`meta[${attribute}="${name}"]`);
      if (!element) { element = document.createElement("meta"); element.setAttribute(attribute, name); document.head.append(element); }
      element.content = content;
    };
    setMeta("description", meta?.description || "مساحة العمل الخاصة بحسابك في Dorucenie.");
    setMeta("robots", meta ? "index, follow, max-image-preview:large" : "noindex, nofollow");
    setMeta("og:title", document.title, true);
    setMeta("og:description", meta?.description || "مساحة العمل الخاصة بحسابك في Dorucenie.", true);
    setMeta("og:url", siteOrigin + path, true);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.append(canonical); }
    canonical.href = siteOrigin + path;
    document.getElementById("site-schema")?.remove();
    if (meta) { const schema = document.createElement("script"); schema.id = "site-schema"; schema.type = "application/ld+json"; schema.textContent = JSON.stringify(pageSchema(path)); document.head.append(schema); }
  }, [path]);
  const run = async (fn) => {
    try {
      const r = await fn();
      await refresh();
      toast(r?.reason || "تم الإجراء بنجاح");
      return r;
    } catch (e) {
      toast(e.message);
      return null;
    }
  };
  const ctx = { path, go, user, data, config, refresh, toast, run };
  if (!ready && !publicPages[path])
    return (
      <div className="loading-screen">
        <img className="brand-symbol" src="/brand/dorucenie-mark.webp" width="56" height="56" alt="Dorucenie"/>
        <p>نجهز مساحة عملك…</p>
      </div>
    );
  return (
    <Context.Provider value={ctx}>
      {publicPages[path] ? <PublicPage path={path} Link={Link} user={user} settings={config?.settings}/> : error ? (
        <div className="fatal">
          <h1>تعذر الاتصال بالموقع</h1>
          <p>{error}</p>
          <Button onClick={() => location.reload()}>إعادة المحاولة</Button>
        </div>
      ) : (
        <>
          {["/login", "/register", "/forgot", "/reset"].includes(path) ? (
            <Auth />

          ) : user && data ? (
            <Shell />
          ) : /^\/(dashboard|apps|market|publisher|wallet|checkout|notifications|support|settings|admin)(\/|$)/.test(path) ? (
            <Auth />
          ) : <div className="fatal"><Logo/><h1>الصفحة غير موجودة</h1><Link to="/" className="button primary">العودة للرئيسية</Link></div>}
        </>
      )}
      {notification && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {notification}
        </div>
      )}
    </Context.Provider>
  );
}
function Footer() { return <PublicFooter Link={Link}/>; }
function Auth() {
  const { path, go, refresh } = useApp();
  const register = path === "/register",
    forgot = path === "/forgot",
    reset = path === "/reset";
  const [selected, setSelected] = useState(
    new URLSearchParams(location.search).get("role") === "publisher"
      ? "publisher"
      : "client",
  );
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Logo />
        <div>
          <span className="pill">تبدأ الشراكة من هنا</span>
          <h1>
            الخطوة التالية
            <br />
            لتطبيقك،
            <br />
            <em>ولفرصك.</em>
          </h1>
          <p>
            مساحة تجمع أصحاب التطبيقات وشركاء النشر.
            <br />
            كل اتفاق له تفاصيل. وكل دفعة لها سجل.
          </p>
          <div className="auth-steps">
            <span>
              <FileCheck2 /> مراجعة التطبيقات
            </span>
            <span>
              <ShieldCheck /> تحقق من النشر
            </span>
            <span>
              <Wallet /> متابعة الأموال
            </span>
          </div>
        </div>
        <small>Dorucenie منصة مستقلة وغير تابعة لـ Google.</small>
      </div>
      <div className="auth-form">
        <Link className="back-link" to="/">
          <ArrowRight size={17} /> العودة للرئيسية
        </Link>
        <h2>
          {register
            ? "أنشئ حسابك"
            : forgot
              ? "استعادة كلمة المرور"
              : reset
                ? "كلمة مرور جديدة"
                : "أهلًا بعودتك"}
        </h2>
        <p>
          {register
            ? "اختر دورك لنجهز مساحة العمل المناسبة لك."
            : "تابع تطبيقاتك وطلباتك من مكان واحد."}
        </p>
        {register && (
          <div className="role-picker">
            {[
              ["client", "صاحب تطبيق", "أريد نشر تطبيقي", Smartphone],
              ["publisher", "صاحب حساب", "أريد نشر تطبيقات", Store],
            ].map(([value, title, desc, Icon]) => (
              <button
                key={value}
                onClick={() => setSelected(value)}
                className={selected === value ? "selected" : ""}
              >
                <Icon />
                <strong>{title}</strong>
                <small>{desc}</small>
                {selected === value && (
                  <CheckCircle2 size={17} className="selected-check" />
                )}
              </button>
            ))}
          </div>
        )}
        <ActionForm
          key={path}
          submit={
            register
              ? "إنشاء حساب"
              : forgot
                ? "إرسال رابط الاستعادة"
                : reset
                  ? "حفظ كلمة المرور"
                  : "تسجيل الدخول"
          }
          onSubmit={async (b) => {
            if (reset) {
              await api("/auth/reset", {
                token: new URLSearchParams(location.search).get("token"),
                password: b.password,
              });
              go("/login");
              return;
            }
            if (forgot) {
              await api("/auth/forgot", b);
              return;
            }
            const r = await api(register ? "/auth/register" : "/auth/login", {
              ...b,
              role: selected,
              terms: b.terms === "on",
            });
            csrf = r.csrf;
            await refresh();
            go(
              r.user.role === "admin"
                ? "/admin"
                : register && selected === "publisher"
                  ? "/publisher"
                  : "/dashboard",
            );
          }}
        >
          {register && (
            <Field
              label="الاسم الكامل"
              name="name"
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              placeholder="محمد أحمد"
            />
          )}
          {!reset && (
            <Field
              label="البريد الإلكتروني"
              type="email"
              dir="ltr"
              name="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          )}
          {!forgot && (
            <Field
              label="كلمة المرور"
              type="password"
              name="password"
              minLength={register || reset ? 10 : 1}
              maxLength={128}
              required
              autoComplete={
                register || reset ? "new-password" : "current-password"
              }
              placeholder={register ? "10 أحرف على الأقل" : "أدخل كلمة المرور"}
            />
          )}{" "}
          {!register && !forgot && !reset && (
            <Link to="/forgot" className="text-link">
              نسيت كلمة المرور؟
            </Link>
          )}
          {register && (
            <label className="checkbox">
              <input name="terms" type="checkbox" required /> أوافق على{" "}
              <Link to="/legal/terms">الشروط</Link> و
              <Link to="/legal/privacy">الخصوصية</Link>
            </label>
          )}
        </ActionForm>
        <p className="auth-switch">
          {register ? "لديك حساب بالفعل؟" : "ليس لديك حساب؟"}{" "}
          <Link to={register ? "/login" : "/register"}>
            {register ? "تسجيل الدخول" : "إنشاء حساب جديد"}
          </Link>
        </p>
      </div>
    </div>
  );
}
const navs = [
  ["/dashboard", "نظرة عامة", LayoutDashboard],
  ["/apps", "تطبيقاتي وطلباتي", Layers],
  ["/market", "فرص النشر", BriefcaseBusiness],
  ["/publisher", "حساب النشر", ShieldCheck],
  ["/wallet", "المحفظة", Wallet],
  ["/notifications", "الإشعارات", Bell],
  ["/support", "الدعم والمساعدة", LifeBuoy],
  ["/settings", "إعدادات الحساب", Settings],
];
const adminNav = [
  ["/admin", "نظرة عامة", LayoutDashboard],
  ["/admin/apps", "التطبيقات والطلبات", Layers],
  ["/admin/publishers", "حسابات الناشرين", ShieldCheck],
  ["/admin/users", "المستخدمون", Users],
  ["/admin/payments", "المدفوعات", CreditCard],
  ["/admin/withdrawals", "طلبات السحب", Wallet],
  ["/admin/disputes", "النزاعات", AlertCircle],
  ["/admin/tickets", "الدعم", LifeBuoy],
  ["/admin/settings", "إعدادات المنصة", SlidersHorizontal],
  ["/admin/audit", "سجل الإجراءات", Activity],
];
function Shell() {
  const { path, user, data, run, go } = useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const admin = user.role === "admin";
  const items = admin
    ? adminNav
    : navs.filter(
        ([p]) =>
          user.role === "publisher" || !["/market", "/publisher"].includes(p),
      );
  const title = items.find(([p]) => path === p)?.[1] || "تفاصيل الطلب";
  return (
    <div className="app-shell">
      {open && <div className="sidebar-scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <Logo />
        <div className="workspace-tag">
          <span className="workspace-icon">
            {admin ? <Shield size={17} /> : <BriefcaseBusiness size={17} />}
          </span>
          <div>
            <strong>{admin ? "إدارة المنصة" : "مساحة العمل"}</strong>
            <small>{roleNames[user.role]}</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <small className="nav-caption">
          {admin ? "إدارة Dorucenie" : "مساحتك"}
        </small>
        <nav>
          {items.map(([to, label, Icon]) => (
            <Link
              to={to}
              key={to}
              className={
                path === to || (to === "/apps" && path.startsWith("/apps/"))
                  ? "active"
                  : ""
              }
            >
              <Icon size={20} />
              <span>{label}</span>
              {to.endsWith("notifications") &&
                data.notifications.some((n) => !n.read) && (
                  <span className="nav-count">
                    {data.notifications.filter((n) => !n.read).length}
                  </span>
                )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="trust-note">
            <ShieldCheck size={23} />
            <strong>كل خطوة موثّقة</strong>
            <p>تابع طلباتك ومدفوعاتك بوضوح.</p>
          </div>
          <button className="user-card" onClick={() => go("/settings")}>
            <span className="avatar">{user.name.charAt(0)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{roleNames[user.role]}</small>
            </span>
            <Settings size={17} />
          </button>
          <button
            className="logout"
            onClick={() =>
              run(async () => {
                await api("/logout", {});
                go("/");
              })
            }
          >
            <LogOut size={16} /> تسجيل الخروج
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-only"
              aria-label="القائمة"
              onClick={() => setOpen(!open)}
            >
              <Menu />
            </button>
            <span>مساحة العمل</span>
            <ChevronLeft size={14} />
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <span className="date-text">{date(new Date())}</span>
            <Link
              to="/notifications"
              className="icon-button"
              aria-label="الإشعارات"
            >
              <Bell size={20} />
              {data.notifications.some((n) => !n.read) && <i />}
            </Link>
            <span className="avatar small">{user.name.charAt(0)}</span>
          </div>
        </header>
        <main className="workspace">
          {data.settings.maintenance && (
            <Notice type="error">
              المنصة في وضع الصيانة. إجراءات المستخدمين متوقفة مؤقتًا.
            </Notice>
          )}
          {path.startsWith("/admin") ? (
            admin ? (
              <Admin />
            ) : (
              <Empty title="هذه الصفحة مخصصة للإدارة" />
            )
          ) : path === "/dashboard" ? (
            <Dashboard />
          ) : path === "/apps" ? (
            <Apps />
          ) : path === "/apps/new" ? (
            <NewApp />
          ) : path.startsWith("/apps/") ? (
            <AppDetail id={path.split("/")[2]} />
          ) : path === "/market" ? (
            <Market />
          ) : path === "/publisher" ? (
            <Publisher />
          ) : path === "/wallet" ? (
            <WalletPage />
          ) : path.startsWith("/checkout") ? (
            <Checkout />
          ) : path === "/notifications" ? (
            <Notifications />
          ) : path === "/support" ? (
            <Support />
          ) : path === "/settings" ? (
            <Profile />
          ) : (
            <Empty title="الصفحة غير موجودة">
              <Link to="/dashboard" className="button primary">
                العودة للوحة
              </Link>
            </Empty>
          )}
        </main>
        <div className="workspace-footer">
          <span>Dorucenie · مساحة نشر تطبيقاتك</span>
          <Link to="/legal/terms">
            الشروط والسياسات <ArrowUpLeft size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
function Stat({ title, value, caption, icon: Icon, color = "" }) {
  return (
    <div className="stat">
      <div>
        <span>{title}</span>
        <span className={`stat-icon ${color}`}>
          <Icon size={21} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{caption}</small>
    </div>
  );
}
function Dashboard() {
  const { user, data } = useApp();
  const publisher = user.role === "publisher";
  const active = data.apps.filter(
    (a) => !["completed", "cancelled", "rejected"].includes(a.status),
  );
  const finished = data.apps.filter((a) => a.status === "completed");
  return (
    <>
      <Heading
        eyebrow="مساحتك، تحت السيطرة"
        title={`أهلًا ${user.name.split(" ")[0]}`}
        text="كل ما تحتاجه لمتابعة رحلة النشر، في مكان واحد."
        action={
          <Link
            to={publisher ? "/market" : "/apps/new"}
            className="button primary"
          >
            <Plus size={18} />
            {publisher ? "استكشف فرص النشر" : "طلب نشر جديد"}
          </Link>
        }
      />
      <div className="dashboard-hero">
        <div>
          <span className="pill dark-pill">
            <ShieldCheck size={15} />{" "}
            {publisher ? "فرص تناسب حسابك" : "من الفكرة إلى المتجر"}
          </span>
          <h2>
            {publisher
              ? "خبرتك في النشر، فرصتك القادمة."
              : "جاهز ليصل تطبيقك إلى العالم؟"}
          </h2>
          <p>
            {publisher
              ? "راجع التطبيقات المقبولة وقدم عرضك على الطلب المناسب لك."
              : "أضف تطبيقك، حدد ميزانيتك، واختر شريك النشر المناسب."}
          </p>
          <Link
            to={publisher ? "/market" : "/apps/new"}
            className="button white"
          >
            {publisher ? "استكشف الطلبات" : "ابدأ رحلة النشر"}
            <ArrowUpLeft size={18} />
          </Link>
        </div>
        <div className="hero-metric">
          <span className="ring-icon">
            <Smartphone size={39} />
          </span>
          <strong>
            {publisher ? "اختر. انشر. اربح." : "ارفع. تابع. انطلق."}
          </strong>
          <span>خطوات واضحة · متابعة مستمرة</span>
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          title={publisher ? "طلبات النشر" : "إجمالي التطبيقات"}
          value={data.apps.length}
          caption="جميع طلباتك في المنصة"
          icon={Layers}
        />
        <Stat
          title="طلبات نشطة"
          value={active.length}
          caption="رحلة النشر مستمرة"
          icon={Clock}
          color="orange"
        />
        <Stat
          title="تم نشرها"
          value={finished.length}
          caption="طلبات اكتملت تسويتها"
          icon={CheckCircle2}
          color="green"
        />
        <Stat
          title="رصيد المحفظة"
          value={money(data.balance.available)}
          caption={`محجوز: ${money(data.balance.held)}`}
          icon={Wallet}
          color="purple"
        />
      </div>
      <div className="dashboard-columns">
        <Section
          title="آخر الطلبات"
          subtitle="تابع حالة كل تطبيق والخطوة التالية"
          action={
            <Link className="text-link" to="/apps">
              عرض الكل <ArrowLeft size={15} />
            </Link>
          }
        >
          {data.apps.length ? (
            <AppTable apps={data.apps.slice(0, 5)} />
          ) : (
            <Empty
              title={
                publisher ? "طلباتك المختارة ستظهر هنا" : "ابدأ بتطبيقك الأول"
              }
              text={
                publisher
                  ? "عندما يختارك صاحب تطبيق، يمكنك متابعة الطلب من هنا."
                  : "قدّم ملف التطبيق وتفاصيله ليبدأ فريق المراجعة فحصه."
              }
            >
              <Link
                to={publisher ? "/market" : "/apps/new"}
                className="button secondary"
              >
                <Plus size={16} />
                {publisher ? "فرص النشر" : "إضافة تطبيق"}
              </Link>
            </Empty>
          )}
        </Section>
        <div className="stack">
          <Section title="خطوتك التالية">
            <div className="checklist">
              {(publisher
                ? [
                    ["أكمل ملف الناشر", Boolean(data.publisher), "/publisher"],
                    [
                      "تحقق من حساب النشر",
                      data.publisher?.status === "approved",
                      "/publisher",
                    ],
                    ["قدم عرضك الأول", data.apps.length > 0, "/market"],
                  ]
                : [
                    ["أنشئ حسابك", true, "/settings"],
                    ["أضف رصيد الخدمات", data.balance.available > 0, "/wallet"],
                    ["أرسل تطبيقك للفحص", data.apps.length > 0, "/apps/new"],
                  ]
              ).map(([label, done, to], i) => (
                <Link to={to} key={label}>
                  <span className={done ? "step-check done" : "step-check"}>
                    {done ? <Check size={14} /> : i + 1}
                  </span>
                  <strong>{label}</strong>
                  <ChevronLeft size={15} />
                </Link>
              ))}
            </div>
          </Section>
          <div className="help-card">
            <LifeBuoy size={25} />
            <h3>نحن هنا لنساعدك</h3>
            <p>لديك سؤال عن طلبك أو عن خطوات النشر؟ افتح تذكرة وتابع الرد.</p>
            <Link to="/support">
              تواصل مع الدعم <ArrowLeft size={16} />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
function AppTable({ apps }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>التطبيق</th>
            <th>الحالة</th>
            <th>ميزانية النشر</th>
            <th>تاريخ الطلب</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {apps.map((a, i) => (
            <tr key={a.id}>
              <td>
                <Link to={`/apps/${a.id}`} className="app-cell">
                  <span className={`app-icon color-${i % 4}`}>
                    <Smartphone size={21} />
                  </span>
                  <span>
                    <strong>{a.title}</strong>
                    <small dir="ltr">{a.packageName}</small>
                  </span>
                </Link>
              </td>
              <td>
                <Badge status={a.status} />
              </td>
              <td className="numeric">{money(a.price.publishFee)}</td>
              <td className="muted">{date(a.createdAt)}</td>
              <td>
                <Link
                  to={`/apps/${a.id}`}
                  aria-label={`تفاصيل ${a.title}`}
                  className="icon-button"
                >
                  <ArrowUpLeft size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Apps() {
  const { data, user } = useApp(),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const apps = data.apps.filter(
    (a) =>
      (filter === "all" || a.status === filter) &&
      `${a.title} ${a.packageName}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <Heading
        title="تطبيقاتي وطلباتي"
        text="رحلة كل تطبيق، من الفحص حتى النشر."
        action={
          user.role === "client" && (
            <Link to="/apps/new" className="button primary">
              <Plus size={17} /> طلب نشر جديد
            </Link>
          )
        }
      />
      <Section
        title={`${data.apps.length} طلب`}
        action={
          <div className="filters">
            <div className="search">
              <Search size={17} />
              <input
                aria-label="البحث في التطبيقات"
                placeholder="ابحث عن تطبيق…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              aria-label="حالة الطلب"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">كل الحالات</option>
              {Object.entries(statusNames)
                .slice(0, 10)
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </div>
        }
      >
        {apps.length ? (
          <AppTable apps={apps} />
        ) : (
          <Empty
            title="لا توجد طلبات مطابقة"
            text="أضف تطبيقًا جديدًا أو جرّب تغيير البحث."
          />
        )}
      </Section>
    </>
  );
}
async function uploadFile(file, kind = "app") {
  if (!file || !file.size) throw new Error("اختر الملف أولًا");
  const upload = await api("/uploads", {
    name: file.name,
    size: file.size,
    kind,
  });
  for (
    let offset = 0, part = 0;
    offset < file.size;
    offset += upload.chunkSize, part++
  ) {
    await requestJson(`/api/uploads/${upload.id}/parts/${part}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-CSRF-Token": csrf,
      },
      body: file.slice(offset, offset + upload.chunkSize),
    });
  }
  return api(`/uploads/${upload.id}/finish`, {});
}

function NewApp() {
  const { data, user, go } = useApp();
  const [budget, setBudget] = useState(data.settings.minPublishBudget / 100);
  if (user.role !== "client")
    return <Empty title="إضافة التطبيقات متاحة لحسابات أصحاب التطبيقات" />;
  const s = data.settings;
  return (
    <>
      <Heading
        eyebrow="طلب جديد"
        title="لنجهّز تطبيقك للنشر"
        text="أضف التفاصيل بعناية لتساعد فريق الفحص والناشر على فهم تطبيقك."
      />
      <div className="detail-columns">
        <Section
          title="بيانات التطبيق"
          subtitle="الحقول المطلوبة تساعد على مراجعة طلبك"
        >
          <ActionForm
            submit="إرسال التطبيق للفحص"
            onSubmit={async (b) => {
              const file = await uploadFile(b.binary);
              const a = await api("/apps", {
                ...b,
                fileId: file.id,
                budget: Math.round(Number(b.budget) * 100),
                rights: b.rights === "on",
              });
              go(`/apps/${a.id}`);
            }}
          >
            <div className="form-grid">
              <Field
                label="اسم التطبيق"
                name="title"
                required
                minLength={2}
                maxLength={80}
                placeholder="اسم تطبيقك"
              />
              <Field label="التصنيف">
                <select name="category" required>
                  {[
                    "أدوات وإنتاجية",
                    "تعليم",
                    "أسلوب حياة",
                    "أعمال",
                    "تسوق",
                    "ألعاب",
                    "أخرى",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="معرّف التطبيق Package name"
                name="packageName"
                pattern="[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+"
                maxLength={180}
                title="أدخل معرّف الحزمة مثل com.example.myapp"
                hint="اكتب applicationId من مشروع تطبيقك، مثل com.example.myapp؛ وليس اسم التطبيق أو رابط المتجر."
                dir="ltr"
                required
                placeholder="com.yourcompany.app"
              />
              <Field
                label="رقم الإصدار"
                name="version"
                dir="ltr"
                required
                placeholder="1.0.0 (1)"
              />
            </div>
            <Field label="وصف التطبيق">
              <textarea
                name="description"
                minLength={20}
                maxLength={5000}
                required
                rows={5}
                placeholder="ما وظيفة التطبيق؟ ما البيانات والأذونات التي يستخدمها؟"
              />
            </Field>
            <Field
              label="رابط سياسة الخصوصية"
              name="privacyUrl"
              type="url"
              required
              dir="ltr"
              placeholder="https://example.com/privacy"
            />
            <Field
              label="ملف التطبيق AAB أو APK"
              hint="حتى 128 MB. الملف خاص بفريق المراجعة والناشر المختار."
            >
              <div className="upload-box">
                <UploadCloud size={29} />
                <strong>أرفق نسخة التطبيق الجاهزة</strong>
                <input name="binary" type="file" accept=".aab,.apk" required />
              </div>
            </Field>
            <Field
              label="ميزانيتك للنشر بالدولار"
              hint={`الحد الأدنى ${money(s.minPublishBudget)}؛ عمولة المنصة ${s.commissionBps / 100}% مشمولة ضمن الميزانية.`}
            >
              <input
                type="number"
                name="budget"
                min={s.minPublishBudget / 100}
                max={10000}
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                required
              />
            </Field>
            <label className="checkbox">
              <input type="checkbox" name="rights" required /> أملك حقوق التطبيق
              ومحتواه وأوافق على فحصه وشروط الخدمة.
            </label>
            <Notice>
              يُحجز رسم الفحص الآن. تحجز ميزانية النشر فقط بعد اختيار الناشر.
              فحص المنصة لا يضمن قبول Google.
            </Notice>
          </ActionForm>
        </Section>
        <aside className="stack">
          <Section title="ملخص التكلفة">
            <div className="summary-row">
              <span>الفحص الأولي</span>
              <strong>{money(s.reviewFee)}</strong>
            </div>
            <div className="summary-row">
              <span>ميزانية النشر</span>
              <strong>{money(Math.round(Number(budget) * 100))}</strong>
            </div>
            <div className="summary-row muted">
              <span>صافي الناشر من الميزانية</span>
              <span>
                {money(
                  Math.round(Number(budget) * 100) *
                    (1 - s.commissionBps / 10000),
                )}
              </span>
            </div>
            <hr />
            <div className="summary-row total">
              <span>المطلوب الآن</span>
              <strong>{money(s.reviewFee)}</strong>
            </div>
            <small>رصيدك المتاح {money(data.balance.available)}</small>
            <Link className="text-link" to="/wallet">
              إضافة رصيد <ArrowLeft size={16} />
            </Link>
          </Section>
          <div className="help-card">
            <ShieldCheck />
            <h3>قبل إرسال التطبيق</h3>
            <p>
              يجب أن يعمل التطبيق، وأن تكون بياناته وسياسة خصوصيته صحيحة. أي
              مكتبات أو خدمات خارجية جزء من المراجعة.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
function Publisher() {
  const { data, user, run } = useApp();
  if (user.role !== "publisher")
    return <Empty title="هذه الصفحة لأصحاب حسابات النشر" />;
  const p = data.publisher;
  return (
    <>
      <Heading
        title="حساب النشر"
        text="أثبت قدرتك على إدارة صفحة ناشر قبل استقبال الطلبات."
      />
      {p && (
        <Section title="حالة التحقق" action={<Badge status={p.status} />}>
          {p.status !== "approved" ? (
            <>
              <p>
                ضع الرمز التالي مؤقتًا في وصف التطبيق الذي أدخلته، ثم انتظر ظهور
                التعديل في صفحة المتجر العامة.
              </p>
              <div className="code-block">
                <code>{p.challenge}</code>
                <Button
                  className="secondary"
                  icon={Copy}
                  onClick={() => navigator.clipboard.writeText(p.challenge)}
                >
                  نسخ
                </Button>
              </div>
              <p className="muted">
                هذا يثبت التحكم بالصفحة، ولا يثبت الملكية القانونية لحساب
                Google.
              </p>
              {p.verification && (
                <Notice
                  type={
                    p.verification.status === "verified" ? "success" : "info"
                  }
                >
                  {p.verification.reason}
                </Notice>
              )}
              <Button
                icon={RefreshCw}
                onClick={() => run(() => api("/publisher/verify", {}))}
              >
                تحقق من الرمز الآن
              </Button>
            </>
          ) : (
            <Notice type="success">
              حسابك معتمد. يمكنك تقديم عروض على التطبيقات التي اجتازت المراجعة.
            </Notice>
          )}
          {p.adminNote && <Notice>{p.adminNote}</Notice>}
        </Section>
      )}
      <Section
        title={p ? "بيانات حسابك" : "أكمل ملف الناشر"}
        subtitle="تغيير الهوية يعيد حسابك إلى المراجعة."
      >
        <ActionForm
          submit="حفظ وإرسال للمراجعة"
          onSubmit={(b) => api("/publisher", b)}
        >
          <Field
            label="رابط صفحة الناشر في Google Play"
            name="developerUrl"
            type="url"
            dir="ltr"
            defaultValue={p?.developerUrl}
            required
            placeholder="https://play.google.com/store/apps/dev?id=..."
          />
          <Field
            label="رابط تطبيق منشور سابقًا على الحساب"
            name="sampleUrl"
            type="url"
            dir="ltr"
            defaultValue={p?.sampleUrl}
            required
            placeholder="https://play.google.com/store/apps/details?id=..."
          />
          <Field label="نبذة عن خبرتك">
            <textarea
              name="bio"
              defaultValue={p?.bio}
              minLength={20}
              maxLength={2000}
              required
              rows={4}
            />
          </Field>
          <Field
            label="التصنيفات التي تقبل نشرها"
            name="categories"
            required
            defaultValue={p?.categories}
            placeholder="تعليم، إنتاجية، أدوات…"
          />
          <Notice>
            لا ترسل كلمة مرور Google أو رموز الدخول. ستبقى عملية الرفع داخل
            حسابك وتحت تحكمك.
          </Notice>
        </ActionForm>
      </Section>
    </>
  );
}
function Market() {
  const { data, user, run } = useApp();
  const [selected, setSelected] = useState(null),
    [q, setQ] = useState("");
  if (user.role !== "publisher")
    return <Empty title="فرص النشر متاحة للناشرين" />;
  return (
    <>
      <Heading
        title="فرص النشر"
        text="تطبيقات اجتازت الفحص وتبحث عن شريك نشر."
      />
      {data.publisher?.status !== "approved" ? (
        <Empty
          icon={ShieldCheck}
          title="تحقق من حسابك أولًا"
          text="بعد اعتماد ملفك ستتمكن من الاطلاع على الفرص وتقديم عروضك."
        >
          <Link to="/publisher" className="button primary">
            إكمال حساب النشر
          </Link>
        </Empty>
      ) : (
        <>
          <div className="market-toolbar">
            <strong>{data.market.length} فرصة متاحة</strong>
            <div className="search">
              <Search size={17} />
              <input
                aria-label="البحث في الفرص"
                placeholder="ابحث عن فرصة…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="market-grid">
            {data.market
              .filter((a) => (a.title + a.category).includes(q))
              .map((a) => (
                <article className="market-card" key={a.id}>
                  <div className="section-heading">
                    <span className="app-icon">
                      <Smartphone />
                    </span>
                    <Badge status="approved">اجتاز الفحص</Badge>
                  </div>
                  <h3>{a.title}</h3>
                  <span className="muted">{a.category}</span>
                  <p>{a.description}</p>
                  <div className="summary-row">
                    <span>حصتك من النشر</span>
                    <strong>{money(a.price)}</strong>
                  </div>
                  <Button
                    className={a.offered ? "secondary" : "primary"}
                    disabled={a.offered}
                    onClick={() => setSelected(a)}
                  >
                    {a.offered ? "تم تقديم عرضك" : "راجع وقدم عرضك"}
                    <ArrowUpLeft size={16} />
                  </Button>
                </article>
              ))}
          </div>
          {!data.market.length && (
            <Empty
              title="لا توجد فرص جديدة الآن"
              text="ستظهر التطبيقات هنا بعد اعتماد فريق المراجعة."
            />
          )}
        </>
      )}
      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)}>
          <p>{selected.description}</p>
          <Notice>{selected.report}</Notice>
          <ActionForm
            submit="تقديم عرض النشر"
            onSubmit={async (b) => {
              await api(`/apps/${selected.id}/offer`, b);
              setSelected(null);
            }}
          >
            <Field label="رسالتك لصاحب التطبيق">
              <textarea
                name="note"
                minLength={10}
                required
                rows={4}
                placeholder="وضّح استعدادك ومتطلباتك والمدة التقديرية."
              />
            </Field>
            <Notice>
              حصتك {money(selected.price)}. يُتاح الملف بعد اختيارك. يمكنك فتح
              نزاع إذا اختلف الملف عن الوصف.
            </Notice>
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
function AppDetail({ id }) {
  const { data, user, run } = useApp();
  const a = data.apps.find((a) => a.id === id);
  const [modal, setModal] = useState("");
  if (!a) return <Empty title="الطلب غير موجود أو ليس لديك صلاحية" />;
  const client = a.owner === user.id,
    admin = user.role === "admin";
  const updateList = data.updates.filter((x) => x.appId === id);
  return (
    <>
      <Heading
        eyebrow={`طلب #${id.slice(0, 8)}`}
        title={a.title}
        text={a.packageName}
        action={<Badge status={a.status} />}
      />
      <div className="detail-columns">
        <div className="stack">
          <Section
            title="تفاصيل التطبيق"
            action={
              <a
                className="button secondary small-button"
                href={`/api/files/${a.fileId}`}
              >
                <Download size={16} /> تحميل الملف
              </a>
            }
          >
            <p className="pre-wrap">{a.description}</p>
            <div className="detail-meta">
              <span>
                التصنيف<strong>{a.category}</strong>
              </span>
              <span>
                الإصدار<strong>{a.version}</strong>
              </span>
              <span>
                تاريخ الطلب<strong>{date(a.createdAt)}</strong>
              </span>
            </div>
            <a
              href={a.privacyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              سياسة الخصوصية <ExternalLink size={15} />
            </a>
            {a.report && (
              <Notice>
                <strong>تقرير الفحص</strong>
                <p>{a.report}</p>
              </Notice>
            )}
            {a.disputeReason && (
              <Notice type="error">سبب النزاع: {a.disputeReason}</Notice>
            )}
            {a.resolution && <Notice>{a.resolution}</Notice>}
          </Section>
          {a.status === "open" && client && (
            <Section
              title="عروض الناشرين"
              subtitle="راجع ملف الناشر ثم اختر العرض المناسب."
            >
              {a.offers.length ? (
                a.offers.map((o) => (
                  <div className="offer" key={o.publisherId}>
                    <span className="avatar">{o.name[0]}</span>
                    <div>
                      <strong>{o.name}</strong>
                      <p>{o.note}</p>
                      {data.publishers.find((p) => p.owner === o.publisherId)
                        ?.developerUrl && (
                        <a
                          href={
                            data.publishers.find(
                              (p) => p.owner === o.publisherId,
                            ).developerUrl
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="text-link"
                        >
                          صفحة الناشر <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                    <Button onClick={() => setModal(`choose:${o.publisherId}`)}>
                      اختيار
                    </Button>
                  </div>
                ))
              ) : (
                <Empty
                  icon={Users}
                  title="بانتظار أول عرض"
                  text="طلبك ظاهر للناشرين المعتمدين."
                />
              )}
            </Section>
          )}
          {a.publisherId && (
            <Section title="تسليم النشر والتحقق">
              {user.id === a.publisherId &&
                ["assigned", "submitted"].includes(a.status) && (
                  <ActionForm
                    submit="إرسال رابط التطبيق"
                    onSubmit={(b) => api(`/apps/${id}/submit`, b)}
                  >
                    <Field
                      label="رابط التطبيق على Google Play"
                      name="url"
                      type="url"
                      dir="ltr"
                      defaultValue={a.storeUrl}
                      required
                      placeholder={`https://play.google.com/store/apps/details?id=${a.packageName}`}
                    />
                  </ActionForm>
                )}
              {a.storeUrl && (
                <>
                  <a
                    href={a.storeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="button secondary"
                  >
                    <Globe size={17} /> افتح صفحة التطبيق
                  </a>
                  {a.verification && (
                    <Notice
                      type={
                        a.verification.status === "verified"
                          ? "success"
                          : "info"
                      }
                    >
                      {a.verification.reason}
                      <small>آخر فحص: {date(a.verification.checkedAt)}</small>
                    </Notice>
                  )}
                  {["submitted", "verified", "completed"].includes(
                    a.status,
                  ) && (
                    <Button
                      icon={RefreshCw}
                      onClick={() => run(() => api(`/apps/${id}/verify`, {}))}
                    >
                      التحقق من صفحة المتجر
                    </Button>
                  )}
                </>
              )}
              {a.releaseAt && (
                <p className="muted">
                  انتهاء مهلة الاعتراض:{" "}
                  {new Date(a.releaseAt).toLocaleString("ar")}
                </p>
              )}
              <p className="muted">
                التحقق العام يؤكد صفحة التطبيق والناشر؛ لا يثبت تطابق الملف أو
                توفر التطبيق بكل البلدان.
              </p>
            </Section>
          )}
          {a.publisherId && (
            <Section title="المحادثة">
              <div className="messages">
                {a.messages?.length ? (
                  a.messages.map((m) => (
                    <div
                      className={`message ${m.sender === user.id ? "mine" : ""}`}
                      key={m.id}
                    >
                      <strong>
                        {m.name}
                        <small>{roleNames[m.role]}</small>
                      </strong>
                      <p>{m.text}</p>
                      <time>{date(m.at)}</time>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    ناقشا متطلبات النشر هنا ليبقى الاتفاق موثقًا.
                  </p>
                )}
              </div>
              <ActionForm
                submit="إرسال الرسالة"
                onSubmit={async (b, e) => {
                  await api(`/apps/${id}/message`, b);
                  e.currentTarget?.reset();
                }}
              >
                <Field label="رسالتك">
                  <textarea name="text" required rows={2} maxLength={3000} />
                </Field>
              </ActionForm>
            </Section>
          )}
          {a.status === "completed" && (
            <Section
              title="التحديثات والمتابعة"
              action={
                client && (
                  <Button
                    className="secondary"
                    icon={Plus}
                    onClick={() => setModal("update")}
                  >
                    طلب تحديث
                  </Button>
                )
              }
            >
              <div className="summary-row">
                <div>
                  <strong>متابعة شهرية اختيارية</strong>
                  <p className="muted">
                    {a.managedUntil
                      ? `مدفوعة حتى ${date(a.managedUntil)}`
                      : "لم يتم تجديد المتابعة"}
                  </p>
                </div>
                {client && (
                  <Button
                    disabled={
                      a.managedUntil && Date.parse(a.managedUntil) > Date.now()
                    }
                    onClick={() => setModal("renew")}
                  >
                    {money(a.price.monthlyFee)} / شهر
                  </Button>
                )}
              </div>
              {updateList.map((r) => (
                <div className="update-item" key={r.id}>
                  <div className="section-heading">
                    <strong>تحديث {r.version}</strong>
                    <Badge status={r.status} />
                  </div>
                  <p>{r.note}</p>
                  <a href={`/api/files/${r.fileId}`} className="text-link">
                    تحميل التحديث <Download size={15} />
                  </a>
                  {r.proof && <Notice>{r.proof}</Notice>}
                  {r.publisherId === user.id && r.status === "pending" && (
                    <ActionForm
                      submit="تسليم التحديث"
                      onSubmit={(b) =>
                        api(`/updates/${r.id}`, { action: "submit", ...b })
                      }
                    >
                      <Field label="تفاصيل الإصدار المنشور">
                        <textarea name="proof" minLength={10} required />
                      </Field>
                    </ActionForm>
                  )}
                  {(client || admin) && r.status === "submitted" && (
                    <Button onClick={() => setModal(`update-approve:${r.id}`)}>
                      تأكيد التحديث وصرف مستحقاته
                    </Button>
                  )}
                  {admin && ["pending", "submitted"].includes(r.status) && (
                    <Button
                      className="danger"
                      onClick={() =>
                        run(() => api(`/updates/${r.id}`, { action: "refund" }))
                      }
                    >
                      إلغاء ورد رسوم التحديث
                    </Button>
                  )}
                </div>
              ))}
            </Section>
          )}
        </div>
        <aside className="stack">
          <Section title="تفاصيل الدفع">
            <div className="summary-row">
              <span>رسم الفحص</span>
              <strong>{money(a.price.reviewFee)}</strong>
            </div>
            <div className="summary-row">
              <span>ميزانية النشر</span>
              <strong>{money(a.price.publishFee)}</strong>
            </div>
            <div className="summary-row">
              <span>حصة الناشر</span>
              <strong>{money(a.price.publisherShare)}</strong>
            </div>
            <div className="summary-row">
              <span>عمولة المنصة</span>
              <strong>
                {money(a.price.publishFee - a.price.publisherShare)}
              </strong>
            </div>
            <Notice>
              تُصرف مستحقات النشر بعد التحقق وانتهاء مهلة الاعتراض.
            </Notice>
          </Section>
          <Section title="مسار الطلب">
            <div className="timeline">
              {a.history.map((h, i) => (
                <div key={i}>
                  <span>
                    <Check size={12} />
                  </span>
                  <strong>{h.label}</strong>
                  <small>{date(h.at)}</small>
                </div>
              ))}
            </div>
          </Section>
          {["assigned", "submitted", "verified"].includes(a.status) && (
            <Button
              className="danger outline"
              icon={AlertCircle}
              onClick={() => setModal("dispute")}
            >
              فتح نزاع وتجميد التسوية
            </Button>
          )}
          {admin && <AdminAppActions app={a} />}
        </aside>
      </div>
      {modal && (
        <Modal
          title={
            modal === "update"
              ? "طلب تحديث"
              : modal === "dispute"
                ? "فتح نزاع"
                : "تأكيد العملية"
          }
          onClose={() => setModal("")}
        >
          {modal.startsWith("choose:") ? (
            <ActionForm
              submit={`تأكيد وحجز ${money(a.price.publishFee)}`}
              onSubmit={async () => {
                await api(`/apps/${id}/choose`, {
                  publisherId: modal.split(":")[1],
                });
                setModal("");
              }}
            >
              <Notice>
                سيُحجز المبلغ من رصيدك ويُتاح ملف التطبيق للناشر المختار.
              </Notice>
            </ActionForm>
          ) : modal === "dispute" ? (
            <ActionForm
              submit="فتح النزاع"
              onSubmit={async (b) => {
                await api(`/apps/${id}/dispute`, b);
                setModal("");
              }}
            >
              <Field label="اشرح المشكلة بالتفصيل">
                <textarea name="reason" rows={4} minLength={10} required />
              </Field>
            </ActionForm>
          ) : modal === "renew" ? (
            <ActionForm
              submit={`تجديد مقابل ${money(a.price.monthlyFee)}`}
              onSubmit={async () => {
                await api(`/apps/${id}/renew`, {});
                setModal("");
              }}
            >
              <p>متابعة التطبيق لمدة 30 يومًا. لا تشمل نشر تحديث جديد.</p>
            </ActionForm>
          ) : modal.startsWith("update-approve:") ? (
            <ActionForm
              submit="راجعت الإصدار وأوافق على التسوية"
              onSubmit={async () => {
                await api(`/updates/${modal.split(":")[1]}`, {
                  action: "approve",
                });
                setModal("");
              }}
            >
              <Notice>
                تأكد من الإصدار على جهازك. لا تستطيع المنصة إثبات رقم الإصدار من
                الصفحة العامة فقط.
              </Notice>
            </ActionForm>
          ) : (
            <ActionForm
              submit={`حجز ${money(a.price.updateFee)} وإرسال`}
              onSubmit={async (b) => {
                const f = await uploadFile(b.binary);
                await api(`/apps/${id}/update`, { ...b, fileId: f.id });
                setModal("");
              }}
            >
              <Field label="رقم الإصدار" name="version" required />
              <Field label="ملف التحديث">
                <input type="file" name="binary" accept=".apk,.aab" required />
              </Field>
              <Field label="تفاصيل التحديث">
                <textarea name="note" minLength={10} required />
              </Field>
            </ActionForm>
          )}
        </Modal>
      )}
    </>
  );
}
function WalletPage() {
  const { data, user, go } = useApp(),
    [modal, setModal] = useState(false),
    [network, setNetwork] = useState(enabledMethods(data.settings)[0]?.id || ""),
    [withdrawAmount, setWithdrawAmount] = useState(
      data.settings.minWithdrawal / 100,
    );
  const s = data.settings,
    methods = enabledMethods(s),
    selectedMethod = methodById(network),
    fee =
      s.withdrawFee +
      Math.ceil((Number(withdrawAmount) * 100 * s.withdrawBps) / 10000);
  return (
    <>
      <Heading
        title="المحفظة"
        text="رصيدك ومعاملاتك، بوضوح كامل."
        action={
          user.role === "client" ? (
            <Link to="/checkout" className="button primary">
              <Plus size={18} /> إضافة رصيد
            </Link>
          ) : user.role === "publisher" ? (
            <Button icon={ArrowUpLeft} disabled={!methods.length} onClick={() => setModal(true)}>
              طلب سحب
            </Button>
          ) : null
        }
      />
      <div className="wallet-cards">
        <div className="wallet-main">
          <span>
            <Wallet size={20} /> الرصيد المتاح
          </span>
          <strong>{money(data.balance.available)}</strong>
          <small>
            {user.role === "client"
              ? "مخصص لدفع خدمات النشر والفحص"
              : "متاح لطلب السحب بعد التسوية"}
          </small>
          <div className="wallet-bottom">
            <span>USD · دولار أمريكي</span>
            <ShieldCheck size={24} />
          </div>
        </div>
        <div className="wallet-side">
          <span className="stat-icon orange">
            <LockKeyhole />
          </span>
          <h3>الرصيد المحجوز</h3>
          <strong>{money(data.balance.held)}</strong>
          <p>مبالغ مخصصة لطلبات نشطة أو طلبات سحب لم تكتمل بعد.</p>
        </div>
        <div className="wallet-side">
          <span className="stat-icon green">
            <Coins />
          </span>
          <h3>
            {user.role === "publisher" ? "السحب الرقمي" : "دفع آمن عبر Whop"}
          </h3>
          <p>
            {user.role === "publisher"
              ? `الحد الأدنى ${money(s.minWithdrawal)}. الرسوم ${money(s.withdrawFee)} + ${s.withdrawBps / 100}%.`
              : "أكمل الدفع داخل الموقع. يضاف الرصيد بعد تأكيد العملية من مزود الدفع."}
          </p>
          <small>
            {user.role === "publisher"
              ? `${methods.length} خيارات متاحة · USDT / USDC`
              : "رصيد الخدمات لا يُسحب إلى محفظة رقمية."}
          </small>
        </div>
      </div>
      {user.role === "publisher" && <Section title="طرق سحب أرباحك" subtitle="اختر العملة والشبكة التي تدعمها محفظتك. تنفذ الإدارة التحويل بعد مراجعة الطلب.">
        {methods.length ? <div className="crypto-grid">{methods.map(m => <button type="button" className="crypto-method" key={m.id} onClick={() => {setNetwork(m.id);setModal(true);}}>
          <span className={`coin-symbol ${m.asset.toLowerCase()}`}>{m.asset === "USDT" ? "₮" : "$"}</span><div><strong>{m.asset}</strong><small>{m.label}</small></div><ArrowUpLeft size={18}/>
        </button>)}</div> : <Notice>طلبات السحب متوقفة مؤقتاً. تواصل مع الدعم.</Notice>}
        <div className="crypto-caption"><ShieldCheck size={16}/> الحد الأدنى {money(s.minWithdrawal)} · الرسوم {money(s.withdrawFee)} + {s.withdrawBps / 100}% · الصافي يظهر قبل التأكيد</div>
      </Section>}
      <Section
        title="سجل المعاملات"
        subtitle="كل إضافة أو حجز أو تسوية تظهر هنا"
      >
        {data.ledger.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>العملية</th>
                  <th>المتاح</th>
                  <th>المحجوز</th>
                  <th>التاريخ</th>
                  <th>المرجع</th>
                </tr>
              </thead>
              <tbody>
                {data.ledger.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="transaction-label">
                        <span
                          className={
                            t.available > 0 ? "tx-icon positive" : "tx-icon"
                          }
                        >
                          {t.available > 0 ? (
                            <ArrowDownLeft size={17} />
                          ) : (
                            <ArrowUpLeft size={17} />
                          )}
                        </span>
                        {t.label}
                      </span>
                    </td>
                    <td
                      className={
                        t.available > 0 ? "positive numeric" : "numeric"
                      }
                    >
                      {t.available > 0 ? "+" : ""}
                      {money(t.available)}
                    </td>
                    <td className="numeric">{money(t.held)}</td>
                    <td>{date(t.created_at)}</td>
                    <td>
                      <code>{t.reference.slice(0, 8)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={Wallet}
            title="لا توجد معاملات بعد"
            text="ستظهر عمليات الدفع والحجز والأرباح هنا."
          />
        )}
      </Section>
      <div className="two-column">
        <Section title="طلبات الدفع">
          {data.payments.length ? (
            data.payments.map((p) => (
              <div className="list-row" key={p.id}>
                <div>
                  <strong>{money(p.amount)}</strong>
                  <small>{date(p.createdAt)} · Whop</small>
                </div>
                <Badge status={p.status} />
              </div>
            ))
          ) : (
            <p className="muted">لا توجد طلبات دفع.</p>
          )}
        </Section>
        <Section title="طلبات السحب">
          {data.withdrawals.length ? (
            data.withdrawals.map((w) => (
              <div className="withdraw-item" key={w.id}>
                <div className="section-heading">
                  <strong>{money(w.amount)}</strong>
                  <Badge status={w.status} />
                </div>
                <small>
                  {w.network} · الصافي {money(w.net)} · الرسوم {money(w.fee)}
                </small>
                <code>{w.address}</code>
                {w.cryptoAmount && (
                  <small>
                    الكمية المحولة: {w.cryptoAmount} {w.network.split("-")[0]}
                  </small>
                )}
                {w.status === "paid" && transactionUrl(w.network, w.adminReference) && (
                  <a
                    href={transactionUrl(w.network, w.adminReference)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    عرض معاملة التحويل <ExternalLink size={14} />
                  </a>
                )}
                {w.status === "rejected" && <p>{w.adminReference}</p>}
              </div>
            ))
          ) : (
            <p className="muted">لا توجد طلبات سحب.</p>
          )}
        </Section>
      </div>
      {modal && (
        <Modal title="سحب الأرباح إلى محفظتك" onClose={() => setModal(false)}>
          <ActionForm
            submit="تأكيد طلب السحب"
            onSubmit={async (b) => {
              await api("/withdrawals", {
                ...b,
                amount: Math.round(Number(b.amount) * 100),
                confirmed: b.confirmed === "on",
              });
              setModal(false);
            }}
          >
            <Field label="المبلغ بالدولار">
              <input
                name="amount"
                type="number"
                min={s.minWithdrawal / 100}
                max={data.balance.available / 100}
                step="0.01"
                required
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
              />
            </Field>
            <Field label="العملة والشبكة">
              <select name="network" value={network} onChange={e => setNetwork(e.target.value)} required>
                {methods.map(m => <option key={m.id} value={m.id}>{m.asset} — {m.label}</option>)}
              </select>
            </Field>
            <Field
              label="عنوان محفظتك"
              name="address"
              dir="ltr"
              required
              autoComplete="off"
              placeholder={selectedMethod?.address || "عنوان المحفظة"}
              hint={`تأكد أن محفظتك تستقبل ${selectedMethod?.asset || "العملة"} على شبكة ${selectedMethod?.chain || "السحب المختارة"}. عنوان EVM وحده لا يحدد الشبكة.`}
            />
            <div className="invoice-mini">
              <div className="summary-row">
                <span>المبلغ المحجوز</span>
                <strong>
                  {money(Math.round(Number(withdrawAmount) * 100))}
                </strong>
              </div>
              <div className="summary-row">
                <span>رسوم السحب المعلنة</span>
                <strong>{money(fee)}</strong>
              </div>
              <div className="summary-row total">
                <span>صافي التحويل المستهدف</span>
                <strong>
                  {money(Math.max(0, Number(withdrawAmount) * 100 - fee))}
                </strong>
              </div>
            </div>
            <Notice>
              التحويل ينفذ بعد مراجعة الإدارة. المبالغ مقومة بالدولار؛ ستسجل
              الإدارة كمية العملة الفعلية عند التنفيذ.
            </Notice>
            <label className="checkbox">
              <input type="checkbox" name="confirmed" required /> راجعت عنوان
              المحفظة والشبكة وأتحمل مسؤولية صحتهما.
            </label>
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
function Checkout() {
  const { data, go, refresh } = useApp();
  const [payment, setPayment] = useState(null),
    [paidNotice, setPaidNotice] = useState(
      location.pathname.endsWith("/complete"),
    );
  useEffect(() => {
    if (!payment && !paidNotice) return;
    const t = setInterval(() => refresh().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [payment, paidNotice]);
  const confirmed =
    payment &&
    data.payments.some((p) => p.id === payment.id && p.status === "approved");
  return (
    <>
      <Heading
        eyebrow="مدفوعات Dorucenie"
        title="إضافة رصيد للخدمات"
        text="صفحة الدفع الخاصة بك؛ المبلغ واضح والتأكيد تلقائي."
      />
      <div className="checkout-layout">
        <Section title={confirmed ? "تم تأكيد الدفع" : "تفاصيل الدفع"}>
          {confirmed ? (
            <Empty
              icon={CheckCheck}
              title="وصل تأكيد الدفع"
              text="أضيف الرصيد إلى محفظتك ويمكنك استخدامه الآن."
            >
              <Link to="/wallet" className="button primary">
                العودة إلى المحفظة
              </Link>
            </Empty>
          ) : !data.whopConfigured ? (
            <Notice>
              الدفع غير متاح حاليًا. يلزم تفعيل إعدادات Whop من إدارة الموقع قبل
              استقبال الأموال.
            </Notice>
          ) : payment ? (
            <Suspense fallback={<p>جاري تحميل الدفع الآمن…</p>}>
              <WhopEmbed
                planId={payment.planId}
                sessionId={payment.sessionId}
                returnUrl={`${location.origin}/checkout/complete`}
                theme="light"
                themeOptions={{
                  accentColor: "#0e8d75",
                  backgroundColor: "#ffffff",
                  borderRadius: 10,
                }}
                skipRedirect
                onComplete={() => setPaidNotice(true)}
              />
            </Suspense>
          ) : (
            <ActionForm
              submit="متابعة إلى الدفع الآمن"
              onSubmit={async (b) =>
                setPayment(
                  await api("/checkout", {
                    amount: Math.round(Number(b.amount) * 100),
                  }),
                )
              }
            >
              <Field
                label="المبلغ بالدولار"
                hint={`الحد الأدنى ${money(data.settings.minTopup)}`}
                name="amount"
                type="number"
                step="0.01"
                min={data.settings.minTopup / 100}
                max={10000}
                required
                defaultValue={Math.max(50, data.settings.minTopup / 100)}
              />
              <Notice>
                الرصيد مخصص لخدمات Dorucenie. أي ضرائب أو رسوم إضافية يعرضها مزود
                الدفع قبل التأكيد.
              </Notice>
            </ActionForm>
          )}
          {paidNotice && !confirmed && (
            <Notice>
              ننتظر تأكيد الدفع من Whop. الرجوع من صفحة الدفع وحده لا يضيف
              رصيدًا. راجع سجل المحفظة خلال لحظات.
            </Notice>
          )}
        </Section>
        <aside className="checkout-summary">
          <div className="checkout-lock">
            <LockKeyhole size={28} />
          </div>
          <h2>كل شيء في مكانه.</h2>
          <p>
            ادفع من داخل Dorucenie. بيانات البطاقة تُعالج داخل مكوّن Whop الآمن.
          </p>
          {payment && (
            <div className="summary-row">
              <span>قيمة رصيد الخدمات</span>
              <strong>{money(payment.amount)}</strong>
            </div>
          )}
          <ul>
            <li>
              <Check size={16} /> ربط الدفع بحسابك تلقائيًا
            </li>
            <li>
              <Check size={16} /> سجل معاملات داخل المحفظة
            </li>
            <li>
              <Check size={16} /> تأكيد من مزود الدفع
            </li>
          </ul>
          <Link to="/legal/refunds" className="text-link">
            سياسة الاسترداد <ArrowLeft size={16} />
          </Link>
        </aside>
      </div>
    </>
  );
}
function Notifications() {
  const { data, run } = useApp();
  return (
    <>
      <Heading
        title="الإشعارات"
        text="آخر مستجدات حسابك وطلباتك."
        action={
          <Button
            className="secondary"
            icon={CheckCheck}
            onClick={() => run(() => api("/notifications/read", {}))}
          >
            تعليم الكل كمقروء
          </Button>
        }
      />
      <Section title="صندوق الإشعارات">
        {data.notifications.length ? (
          data.notifications.map((n) => (
            <Link
              key={n.id}
              to={n.link}
              className={`notification-row ${n.read ? "" : "unread"}`}
            >
              <span className="stat-icon">
                <Bell size={19} />
              </span>
              <div>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <small>{date(n.createdAt)}</small>
              </div>
              <ChevronLeft size={17} />
            </Link>
          ))
        ) : (
          <Empty
            icon={Bell}
            title="أنت على اطلاع بكل شيء"
            text="ستظهر تحديثات طلباتك هنا."
          />
        )}
      </Section>
    </>
  );
}
function Support() {
  const { data } = useApp(),
    [modal, setModal] = useState(false);
  return (
    <>
      <Heading
        title="الدعم والمساعدة"
        text="أرسل سؤالك وتابع رد فريق Dorucenie."
        action={
          <Button icon={Plus} onClick={() => setModal(true)}>
            تذكرة جديدة
          </Button>
        }
      />
      <Section title="تذاكري">
        {data.tickets.length ? (
          data.tickets.map((t) => (
            <div className="ticket" key={t.id}>
              <div className="section-heading">
                <h3>{t.subject}</h3>
                <Badge status={t.status} />
              </div>
              <p>{t.body}</p>
              {t.reply && (
                <Notice type="success">
                  <strong>رد الإدارة</strong>
                  <p>{t.reply}</p>
                </Notice>
              )}
              <small>{date(t.createdAt)}</small>
            </div>
          ))
        ) : (
          <Empty
            icon={LifeBuoy}
            title="كيف يمكننا مساعدتك؟"
            text="افتح تذكرة وسيظهر الرد هنا."
          />
        )}
      </Section>
      {modal && (
        <Modal title="تذكرة دعم جديدة" onClose={() => setModal(false)}>
          <ActionForm
            submit="إرسال التذكرة"
            onSubmit={async (b) => {
              await api("/tickets", b);
              setModal(false);
            }}
          >
            <Field label="الموضوع" name="subject" required minLength={3} />
            <Field label="تفاصيل السؤال">
              <textarea name="body" required rows={5} minLength={10} />
            </Field>
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
function Profile() {
  const { user, data } = useApp();
  return (
    <>
      <Heading title="إعدادات الحساب" text="بياناتك وأمان حسابك." />
      <div className="detail-columns">
        <Section title="المعلومات الشخصية">
          <ActionForm onSubmit={(b) => api("/profile", b)}>
            <Field
              label="الاسم"
              name="name"
              defaultValue={user.name}
              required
              minLength={2}
            />
            <Field
              label="البريد الإلكتروني"
              type="email"
              value={user.email}
              readOnly
              hint="لتغيير البريد، تواصل مع الدعم."
            />
            <Field
              label="كلمة المرور الحالية"
              type="password"
              name="currentPassword"
              autoComplete="current-password"
            />
            <Field
              label="كلمة مرور جديدة (اختياري)"
              name="password"
              type="password"
              minLength={10}
              autoComplete="new-password"
            />
          </ActionForm>
        </Section>
        <Section title="نوع الحساب">
          <span className="avatar profile-avatar">{user.name[0]}</span>
          <h3>{user.name}</h3>
          <Badge status="active">{roleNames[user.role]}</Badge>
          <p className="muted">تاريخ التسجيل {date(user.created_at)}</p>
          <Notice>تغيير كلمة المرور ينهي الجلسات الأخرى لحماية حسابك.</Notice>
        </Section>
      </div>
    </>
  );
}
function AdminAppActions({ app: a }) {
  const { run } = useApp();
  return (
    <Section title="إجراءات الإدارة">
      {a.status === "reviewing" && (
        <ActionForm
          submit="اعتماد قرار الفحص"
          onSubmit={(b) =>
            api(`/admin/apps/${a.id}`, { ...b, action: "review" })
          }
        >
          <Field label="قرار الفحص">
            <select name="decision">
              <option value="approve">قبول وعرض للناشرين</option>
              <option value="reject">رفض مع تقرير</option>
            </select>
          </Field>
          <Field label="تقرير الفحص">
            <textarea
              name="report"
              minLength={20}
              rows={4}
              required
              placeholder="اكتب نتيجة فحص المحتوى والأذونات والتشغيل والحقوق."
            />
          </Field>
        </ActionForm>
      )}
      {[
        "reviewing",
        "open",
        "assigned",
        "submitted",
        "verified",
        "disputed",
      ].includes(a.status) && (
        <ActionForm
          submit="إلغاء الطلب ورد المحجوز"
          onSubmit={(b) =>
            api(`/admin/apps/${a.id}`, { action: "cancel", ...b })
          }
        >
          <Field label="سبب الإلغاء">
            <textarea name="note" minLength={10} required />
          </Field>
        </ActionForm>
      )}
      {a.status === "disputed" && (
        <ActionForm
          submit="حسم النزاع لصالح الناشر"
          onSubmit={(b) =>
            api(`/admin/apps/${a.id}`, { action: "resolve", ...b })
          }
        >
          <Field label="القرار والأدلة">
            <textarea name="note" required minLength={10} />
          </Field>
        </ActionForm>
      )}
      {a.status === "verified" && (
        <Button
          disabled={Date.parse(a.releaseAt) > Date.now()}
          onClick={() => run(() => api(`/admin/settle/${a.id}`, {}))}
        >
          تسوية بعد انتهاء المهلة
        </Button>
      )}
    </Section>
  );
}
function Admin() {
  const { path, data, run } = useApp();
  const section = path.split("/")[2] || "overview";
  const [selected, setSelected] = useState(null),
    [query, setQuery] = useState("");
  useEffect(() => {
    setSelected(null);
    setQuery("");
  }, [section]);
  if (section === "overview")
    return (
      <>
        <Heading
          eyebrow="مركز العمليات"
          title="نظرة شاملة على Dorucenie"
          text="راجع الأولويات وأدر المنصة من مساحة واحدة."
        />
        <div className="stats-grid">
          <Stat
            title="المستخدمون"
            value={data.users.length}
            caption={`${data.users.filter((u) => u.role === "publisher").length} شريك نشر`}
            icon={Users}
          />
          <Stat
            title="طلبات الفحص"
            value={data.apps.filter((a) => a.status === "reviewing").length}
            caption="بانتظار قرار المراجعة"
            icon={FileCheck2}
            color="orange"
          />
          <Stat
            title="طلبات السحب"
            value={
              data.withdrawals.filter((w) => w.status === "pending").length
            }
            caption="تحتاج تنفيذًا ومراجعة"
            icon={Wallet}
            color="purple"
          />
          <Stat
            title="دخل المنصة المسجل"
            value={money(data.platformBalance.available)}
            caption="قبل مصاريف Whop والتشغيل"
            icon={TrendingUp}
            color="green"
          />
        </div>
        <div className="two-column">
          <Section title="قائمة المتابعة">
            {[
              [
                "طلبات الفحص",
                data.apps.filter((a) => a.status === "reviewing").length,
                "apps",
                FileCheck2,
              ],
              [
                "ناشرون بانتظار الاعتماد",
                data.publishers.filter((p) => p.status === "pending").length,
                "publishers",
                ShieldCheck,
              ],
              [
                "نزاعات مفتوحة",
                data.apps.filter((a) => a.status === "disputed").length,
                "disputes",
                AlertCircle,
              ],
              [
                "تذاكر الدعم",
                data.tickets.filter((t) => t.status === "open").length,
                "tickets",
                LifeBuoy,
              ],
            ].map(([label, n, to, Icon]) => (
              <Link className="admin-task" to={`/admin/${to}`} key={to}>
                <span className="stat-icon">
                  <Icon size={20} />
                </span>
                <strong>{label}</strong>
                <span className="count">{n}</span>
                <ChevronLeft size={16} />
              </Link>
            ))}
          </Section>
          <Section title="جاهزية الخدمات">
            <div className="list-row">
              <span>Whop والدفع المضمّن</span>
              <Badge status={data.whopConfigured ? "approved" : "pending"} />
            </div>
            <div className="list-row">
              <span>بريد استعادة الحساب</span>
              <Badge status={data.emailConfigured ? "approved" : "pending"} />
            </div>
            <div className="list-row">
              <span>التحقق من Google Play</span>
              <Badge status="active">صفحة عامة بدون API</Badge>
            </div>
            <div className="list-row">
              <span>السحب الرقمي</span>
              <Badge status="pending">تنفيذ الإدارة</Badge>
            </div>
            <Notice>
              طلبات السحب لا تُعد مدفوعة حتى تنفيذ التحويل وتسجيل معرّف
              المعاملة.
            </Notice>
          </Section>
        </div>
        <Section title="أحدث الطلبات">
          {data.apps.length ? (
            <AppTable apps={data.apps.slice(0, 6)} />
          ) : (
            <Empty title="لا توجد طلبات بعد" />
          )}
        </Section>
      </>
    );
  if (section === "settings") return <AdminSettings />;
  if (section === "audit")
    return (
      <>
        <Heading
          title="سجل الإجراءات"
          text="تسلسل زمني لإجراءات الإدارة والعمليات المالية."
        />
        <Section title="آخر 200 إجراء">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الإجراء</th>
                  <th>المنفذ</th>
                  <th>السجل</th>
                  <th>التفاصيل</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <code>{a.action}</code>
                    </td>
                    <td>
                      {data.users.find((u) => u.id === a.actor)?.name ||
                        a.actor}
                    </td>
                    <td>
                      <code>{a.target.slice(0, 12)}</code>
                    </td>
                    <td>{a.detail || "—"}</td>
                    <td>{new Date(a.created_at).toLocaleString("ar")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </>
    );
  if (["apps", "disputes"].includes(section)) {
    const rows = data.apps.filter(
      (a) =>
        (section !== "disputes" || a.status === "disputed") &&
        (a.title + a.packageName).includes(query),
    );
    return (
      <>
        <Heading
          title={
            section === "apps" ? "التطبيقات والطلبات" : "النزاعات المفتوحة"
          }
          text="افتح الطلب للاطلاع على الملفات والتقارير والمحادثات والإجراءات."
        />
        <Section
          title={`${rows.length} طلب`}
          action={
            <div className="search">
              <Search size={17} />
              <input
                aria-label="بحث"
                placeholder="بحث…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          }
        >
          {rows.length ? (
            <AppTable apps={rows} />
          ) : (
            <Empty title="لا توجد طلبات في هذا القسم" />
          )}
        </Section>
      </>
    );
  }
  const titles = {
    users: "المستخدمون",
    publishers: "حسابات الناشرين",
    payments: "المدفوعات",
    withdrawals: "طلبات السحب الرقمي",
    tickets: "تذاكر الدعم",
  };
  const rows = (data[section] || []).filter((r) =>
    JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <Heading
        title={titles[section] || "الإدارة"}
        text="راجع التفاصيل واتخذ القرار المناسب. جميع الإجراءات تُسجّل."
      />
      <Section
        title={`${rows.length} سجل`}
        action={
          <div className="search">
            <Search size={17} />
            <input
              aria-label="بحث في السجلات"
              placeholder="ابحث…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        }
      >
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الاسم / السجل</th>
                  <th>التفاصيل</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name || r.subject || r.id.slice(0, 8)}</strong>
                      <small>
                        {section === "users"
                          ? r.email
                          : section === "tickets"
                            ? r.subject
                            : ""}
                      </small>
                    </td>
                    <td>
                      {section === "users" ? (
                        roleNames[r.role]
                      ) : section === "publishers" ? (
                        r.categories
                      ) : section === "payments" ||
                        section === "withdrawals" ? (
                        <span className="numeric">
                          {money(r.amount)} {r.network && `· ${r.network}`}
                        </span>
                      ) : (
                        r.body.slice(0, 55)
                      )}
                    </td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td>{date(r.createdAt || r.created_at)}</td>
                    <td>
                      <Button
                        className="secondary small-button"
                        icon={Eye}
                        onClick={() => setSelected(r)}
                      >
                        مراجعة
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="لا توجد سجلات مطابقة" />
        )}
      </Section>
      {selected && (
        <Modal title="مراجعة السجل" onClose={() => setSelected(null)}>
          {section === "users" ? (
            <>
              <h3>{selected.name}</h3>
              <p>{selected.email}</p>
              <Notice>
                المتاح {money(selected.balance.available)} · المحجوز{" "}
                {money(selected.balance.held)}
              </Notice>
              {selected.role !== "admin" && (
                <ActionForm
                  submit={
                    selected.status === "active"
                      ? "تعليق الحساب"
                      : "تفعيل الحساب"
                  }
                  onSubmit={async () => {
                    await api(`/admin/users/${selected.id}`, {
                      status:
                        selected.status === "active" ? "suspended" : "active",
                    });
                    setSelected(null);
                  }}
                >
                  <p>
                    تعليق الحساب ينهي جلساته ويوقف إجراءاته. تفعيل حساب بعد نزاع
                    دفع يحتاج تدقيق الرصيد أولًا.
                  </p>
                </ActionForm>
              )}
            </>
          ) : section === "publishers" ? (
            <>
              <p>{selected.bio}</p>
              <a
                href={selected.developerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                صفحة الناشر <ExternalLink size={15} />
              </a>
              <Notice
                type={
                  selected.verification?.status === "verified"
                    ? "success"
                    : "info"
                }
              >
                {selected.verification?.reason || "لم ينجح تحقق الرمز بعد."}
              </Notice>
              <ActionForm
                submit="حفظ قرار المراجعة"
                onSubmit={async (b) => {
                  await api(`/admin/publishers/${selected.id}`, b);
                  setSelected(null);
                }}
              >
                <Field label="القرار">
                  <select name="action">
                    <option value="approve">اعتماد الناشر بعد التحقق</option>
                    <option value="reject">رفض / إيقاف الاعتماد</option>
                  </select>
                </Field>
                <Field label="ملاحظات">
                  <textarea name="note" />
                </Field>
              </ActionForm>
            </>
          ) : section === "payments" ? (
            <>
              <div className="summary-row">
                <span>قيمة الدفع</span>
                <strong>{money(selected.amount)}</strong>
              </div>
              <Badge status={selected.status} />
              <p>المزود: Whop</p>
              <code>
                {selected.providerPaymentId ||
                  selected.sessionId ||
                  "لم تكتمل جلسة الدفع"}
              </code>
              <Notice>
                اعتماد المدفوعات يتم بإشعار Whop الموقّع فقط. الاسترداد إلى
                وسيلة الدفع الأصلية يُنفذ من حساب Whop، ثم يُدقق الرصيد عند وصول
                إشعار الاسترداد.
              </Notice>
              {selected.riskEvent && (
                <Notice type="error">
                  تنبيه يستدعي التدقيق: {selected.riskEvent}
                </Notice>
              )}
            </>
          ) : section === "withdrawals" ? (
            <>
              <div className="invoice-mini">
                <div className="summary-row">
                  <span>المبلغ</span>
                  <strong>{money(selected.amount)}</strong>
                </div>
                <div className="summary-row">
                  <span>الرسوم</span>
                  <strong>{money(selected.fee)}</strong>
                </div>
                <div className="summary-row">
                  <span>صافي مستهدف</span>
                  <strong>{money(selected.net)}</strong>
                </div>
                <p><strong>{methodById(selected.network)?.asset}</strong> · {methodById(selected.network)?.label || selected.network}</p>
                <code>{selected.address}</code>
              </div>
              {selected.status === "pending" ? (
                <ActionForm
                  submit="حفظ نتيجة التنفيذ"
                  onSubmit={async (b) => {
                    await api(`/admin/withdrawals/${selected.id}`, b);
                    setSelected(null);
                  }}
                >
                  <Field label="القرار">
                    <select name="action">
                      <option value="approve">نفذت التحويل بالفعل</option>
                      <option value="reject">رفض وإعادة المبلغ للمحفظة</option>
                    </select>
                  </Field>
                  <Field
                    label="معرّف المعاملة TxID أو سبب الرفض"
                    name="reference"
                    required
                    minLength={3}
                    dir="ltr"
                  />
                  <Field
                    label="كمية العملة التي أرسلت فعليًا (عند التنفيذ)"
                    name="cryptoAmount"
                    type="number"
                    min="0"
                    step="0.00000001"
                  />
                  <Notice>
                    تحقق من الشبكة والعنوان ونفذ التحويل خارج الموقع قبل تسجيله
                    هنا.
                  </Notice>
                </ActionForm>
              ) : (
                <p className="break-all">{selected.adminReference}</p>
              )}
            </>
          ) : (
            <>
              <h3>{selected.subject}</h3>
              <p>{selected.body}</p>
              <ActionForm
                submit="إرسال الرد"
                onSubmit={async (b) => {
                  await api(`/admin/tickets/${selected.id}`, {
                    ...b,
                    close: b.close === "on",
                  });
                  setSelected(null);
                }}
              >
                <Field label="رد الإدارة">
                  <textarea
                    name="reply"
                    rows={5}
                    minLength={3}
                    required
                    defaultValue={selected.reply}
                  />
                </Field>
                <label className="checkbox">
                  <input type="checkbox" name="close" /> إغلاق التذكرة بعد الرد
                </label>
              </ActionForm>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
function AdminSettings() {
  const { data } = useApp(),
    s = data.settings;
  const monetary = [
    ["reviewFee", "رسم فحص التطبيق"],
    ["minPublishBudget", "الحد الأدنى لميزانية النشر"],
    ["minTopup", "الحد الأدنى للدفع"],
    ["minWithdrawal", "الحد الأدنى للسحب"],
    ["withdrawFee", "رسوم السحب الثابتة"],
    ["monthlyFee", "المتابعة الشهرية"],
    ["monthlyShare", "حصة الناشر الشهرية"],
    ["updateFee", "رسوم التحديث"],
    ["updateShare", "حصة الناشر من التحديث"],
  ];
  return (
    <>
      <Heading
        title="إعدادات المنصة"
        text="تسري الأسعار الجديدة على الطلبات الجديدة. يحتفظ كل طلب بسعره المتفق عليه."
      />
      <Section title="الرسوم وحدود الخدمة">
        <ActionForm
          onSubmit={(b) => {
            const payload = {
              ...Object.fromEntries(
                monetary.map(([k]) => [k, Math.round(Number(b[k]) * 100)]),
              ),
              commissionBps: Math.round(Number(b.commission) * 100),
              withdrawBps: Math.round(Number(b.withdrawPercent) * 100),
              holdHours: Number(b.holdHours),
              supportEmail: b.supportEmail,
              maintenance: b.maintenance === "on",
              withdrawalNetworks: cryptoMethods.filter(m => b[`network_${m.id}`] === "on").map(m => m.id),
            };
            return api("/admin/settings", payload);
          }}
        >
          <div className="form-grid">
            {monetary.map(([key, label]) => (
              <Field
                key={key}
                label={`${label} (USD)`}
                name={key}
                type="number"
                step="0.01"
                min="0"
                max="10000"
                required
                defaultValue={s[key] / 100}
              />
            ))}
            <Field
              label="عمولة النشر (%)"
              name="commission"
              type="number"
              step="0.01"
              min="0"
              max="50"
              defaultValue={s.commissionBps / 100}
            />
            <Field
              label="رسوم السحب النسبية (%)"
              name="withdrawPercent"
              type="number"
              step="0.01"
              min="0"
              max="50"
              defaultValue={s.withdrawBps / 100}
            />
            <Field
              label="مهلة الاعتراض قبل التسوية (ساعات)"
              name="holdHours"
              type="number"
              min="24"
              max="336"
              defaultValue={s.holdHours}
            />
            <Field
              label="بريد الدعم"
              name="supportEmail"
              type="email"
              defaultValue={s.supportEmail}
            />
          </div>
          <fieldset className="network-settings"><legend>شبكات السحب المتاحة</legend><p className="muted">فعّل الشبكات التي تستطيع تنفيذ التحويل عليها. تعطيل شبكة يمنع الطلبات الجديدة فقط. إلغاء تفعيل الجميع يوقف طلبات السحب الجديدة.</p><div className="network-settings-grid">{cryptoMethods.map(m => <label className="checkbox" key={m.id}><input type="checkbox" name={`network_${m.id}`} defaultChecked={enabledMethods(s).some(n => n.id === m.id)}/><span><strong>{m.asset}</strong><small>{m.label}</small></span></label>)}</div></fieldset>
          <label className="checkbox">
            <input
              name="maintenance"
              type="checkbox"
              defaultChecked={s.maintenance}
            />{" "}
            وضع الصيانة — إيقاف إجراءات المستخدمين مؤقتًا
          </label>
          <Notice>
            مفاتيح Whop والبريد تُحفظ في إعدادات الخادم الآمنة. لا تُعرض مفاتيح
            الدفع أو مفاتيح محافظ العملات داخل لوحة الإدارة.
          </Notice>
        </ActionForm>
      </Section>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
