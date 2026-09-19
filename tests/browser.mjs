import { chromium } from "@playwright/test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
process.env.DATABASE_DRIVER = "pglite";
process.env.APP_ORIGIN = "http://127.0.0.1:3012";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "eldevo-browser-"));
delete process.env.WHOP_API_KEY;
const { db, save, post, atomic } = await import("../server/db.mjs");
const { createUser } = await import("../server/auth.mjs");
const { server } = await import("../server/index.mjs");
const password = "Test-only-secure-password";
const client = await createUser({
  name: "محمد أحمد",
  email: "client@example.test",
  password,
  role: "client",
});
const pub = await createUser({
  name: "أحمد الناشر",
  email: "publisher@example.test",
  password,
  role: "publisher",
});
await createUser({
  name: "إدارة إلديفو",
  email: "admin@example.test",
  password,
  role: "admin",
});
await atomic(
  async () =>
    await post(
      client.id,
      20000,
      0,
      "Test fixture credit",
      "fixture",
      "fixture-credit",
    ),
);
await save("publisher", {
  id: `publisher:${pub.id}`,
  owner: pub.id,
  name: pub.name,
  status: "approved",
  developerIdentity: "/store/apps/dev?id=1234",
  developerUrl: "https://play.google.com/store/apps/dev?id=1234",
  bio: "حساب ناشر للاختبار المحلي فقط",
  categories: "تعليم، إنتاجية",
});
await new Promise((r) => server.listen(3012, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--disable-gpu",
  ],
});
const errors = [];
mkdirSync("playwright-report", {
  recursive: true,
});
try {
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 1050,
    },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByText("تطبيقك جاهز.").waitFor();
  await page.screenshot({
    path: "playwright-report/landing.png",
    fullPage: true,
  });
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile home overflow');
  await page.screenshot({path:'playwright-report/home-mobile.png',fullPage:true});
  for(const route of ['/how-it-works','/pricing','/publishers','/faq','/legal/privacy']) {
    await page.goto(base+route);
    await page.locator('h1').waitFor();
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' mobile overflow');
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'index, follow, max-image-preview:large');
  }
  await page.setViewportSize({width:1440,height:1050});
  await page.goto(base + "/register?role=publisher");
  await page
    .getByRole("button", {
      name: "صاحب حساب",
    })
    .waitFor();
  assert.equal(
    await page
      .locator(".role-picker .selected")
      .innerText()
      .then((t) => t.includes("صاحب حساب")),
    true,
  );
  async function login(email) {
    await page.goto(base + "/login");
    await page.getByLabel("البريد الإلكتروني").fill(email);
    await page
      .getByLabel("كلمة المرور", {
        exact: true,
      })
      .fill(password);
    await page
      .getByRole("button", {
        name: "تسجيل الدخول",
        exact: true,
      })
      .click();
    await page.waitForURL(
      email.startsWith("admin") ? "**/admin" : "**/dashboard",
    );
    await page
      .getByRole("heading", {
        name: email.startsWith("admin") ? "نظرة شاملة على إلديفو" : /أهلًا/,
      })
      .waitFor();
  }
  await login("client@example.test");
  await page.screenshot({
    path: "playwright-report/dashboard.png",
    fullPage: true,
  });
  await page
    .getByRole("link", {
      name: "طلب نشر جديد",
      exact: true,
    })
    .click();
  await page.getByLabel("اسم التطبيق").fill("دفتر المهام");
  await page.getByLabel("معرّف التطبيق Package name").fill("com.example.tasks");
  await page
    .getByLabel("رقم الإصدار", {
      exact: true,
    })
    .fill("1.0.0");
  await page
    .getByLabel("وصف التطبيق")
    .fill("تطبيق بسيط لتنظيم المهام اليومية بدون أذونات حساسة.");
  await page
    .getByLabel("رابط سياسة الخصوصية")
    .fill("https://example.test/privacy");
  await page.locator("input[name=binary]").setInputFiles({
    name: "app.aab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([80, 75, 3, 4, 0, 0, 0, 0]),
  });
  await page.locator("input[name=budget]").fill("75");
  await page.locator("input[name=rights]").check();
  await page
    .getByRole("button", {
      name: "إرسال التطبيق للفحص",
    })
    .click();
  await page
    .getByRole("heading", {
      name: "دفتر المهام",
      exact: true,
    })
    .waitFor();
  await page
    .getByText("قيد الفحص", {
      exact: true,
    })
    .waitFor();
  const appPath = new URL(page.url()).pathname;
  await page.goto(base + "/wallet");
  await page
    .getByRole("heading", {
      name: "المحفظة",
      exact: true,
    })
    .waitFor();
  await page
    .getByText("حجز رسم فحص التطبيق", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", {
      name: "تسجيل الخروج",
    })
    .click();
  await login("admin@example.test");
  await page.goto(base + "/admin");
  await page
    .getByRole("heading", {
      name: "نظرة شاملة على إلديفو",
    })
    .waitFor();
  await page.screenshot({
    path: "playwright-report/admin.png",
    fullPage: true,
  });
  await page.goto(base + appPath);
  await page
    .getByLabel("تقرير الفحص")
    .fill("تم فحص التطبيق والأذونات وحقوق المحتوى وقبول الطلب ضمن الاختبار.");
  await page
    .getByRole("button", {
      name: "اعتماد قرار الفحص",
    })
    .click();
  await page
    .getByText("بانتظار ناشر", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", {
      name: "تسجيل الخروج",
    })
    .click();
  await login("publisher@example.test");
  await page.goto(base + '/wallet');
  await page.getByRole('heading',{name:'طرق سحب أرباحك'}).waitFor();
  assert.equal(await page.locator('.crypto-method').count(),6);
  await page.screenshot({path:'playwright-report/crypto-wallet.png',fullPage:true});
  await page.locator('.crypto-method').filter({hasText:'Base'}).click();
  assert.equal(await page.locator('select[name=network]').inputValue(),'USDC-BASE');
  await page.getByRole('button',{name:'إغلاق',exact:true}).click();
  await page.goto(base + "/market");
  await page
    .getByRole("button", {
      name: "راجع وقدم عرضك",
    })
    .click();
  await page
    .getByLabel("رسالتك لصاحب التطبيق")
    .fill("جاهز لنشر التطبيق بعد الاتفاق ومراجعة ملف الإصدار.");
  await page
    .getByRole("button", {
      name: "تقديم عرض النشر",
    })
    .click();
  await page
    .getByRole("button", {
      name: "تم تقديم عرضك",
    })
    .waitFor();
  await page
    .getByRole("button", {
      name: "تسجيل الخروج",
    })
    .click();
  await login("client@example.test");
  await page.goto(base + appPath);
  await page
    .getByRole("button", {
      name: "اختيار",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: /تأكيد وحجز/,
    })
    .click();
  await page
    .getByText("جارٍ النشر", {
      exact: true,
    })
    .waitFor();
  await page
    .locator("textarea[name=text]")
    .fill("تم اختيارك، يرجى متابعة النشر حسب الاتفاق.");
  await page
    .getByRole("button", {
      name: "إرسال الرسالة",
    })
    .click();
  await page
    .locator(".message")
    .getByText("تم اختيارك، يرجى متابعة النشر حسب الاتفاق.")
    .waitFor();
  await page.goto(base + "/checkout");
  await page
    .getByText("الدفع غير متاح حاليًا.", {
      exact: false,
    })
    .waitFor();
  await page.goto(base + "/dashboard");
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await page
    .getByRole("heading", {
      name: /أهلًا/,
    })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Mobile dashboard overflow",
  );
  await page.screenshot({
    path: "playwright-report/mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "القائمة",
      exact: true,
    })
    .click();
  await page.locator(".sidebar.is-open").waitFor();
  await page
    .locator(".sidebar.is-open")
    .getByRole("link", {
      name: "المحفظة",
      exact: true,
    })
    .click();
  await page
    .getByRole("heading", {
      name: "المحفظة",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Mobile wallet overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: landing, role selection, login, funded submission, admin review, publisher offer, customer selection, held funds, chat, unavailable checkout, mobile navigation; no browser errors.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await db.close();
  rmSync(process.env.DATA_DIR, {
    recursive: true,
    force: true,
  });
}
