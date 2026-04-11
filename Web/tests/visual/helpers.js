export async function mockApi(page, handlers) {
  await page.route('http://localhost:5000/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    for (const handler of handlers) {
      if (handler.match(pathname, method, url)) {
        await route.fulfill(handler.response);
        return;
      }
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

export const jsonResponse = (status, body) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});
