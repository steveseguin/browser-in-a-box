async function generic_webpage(browser, app, ready) {
    const page = (await browser.pages())[0];
    
    page.on('console', msg => console.log(`[generic]${msg.text()}`));
    await page.setBypassCSP(true);
    await page.goto(app.url.toString());
    if(ready) {
      ready('Generic : waiting forever');
    }
    return new Promise((resolve) => {
      const finish = () => {
        page.off('close', finish);
        browser.off('disconnected', finish);
        resolve();
      };
      page.on('close', finish);
      browser.on('disconnected', finish);
      // Closing during navigation or the ready callback must not leave us waiting.
      if (page.isClosed() || !browser.isConnected()) {
        finish();
      }
    });
  }
  export {generic_webpage};
  export default generic_webpage;