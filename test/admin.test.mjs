import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('admin exact visit count filters customers and shows the matching total', async () => {
  class Element {
    value = '';
    textContent = '';
    children = [];
    classList = { toggle() {}, add() {}, remove() {} };
    addEventListener() {}
    focus() {}
    replaceChildren() { this.children = []; }
    append(...items) { this.children.push(...items); }
  }
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const context = vm.createContext({
    document: { querySelector: element, querySelectorAll: () => [], createElement: () => new Element() },
    window: { gsap: {}, matchMedia: () => ({ matches: true }) },
    fetch: async () => ({ status: 401 }),
    setTimeout: () => 0, clearTimeout() {}, Intl, Date,
  });
  vm.runInContext(readFileSync(new URL('../public/admin.js', import.meta.url), 'utf8'), context);
  await new Promise((resolve) => setImmediate(resolve));
  vm.runInContext(`customerReportData = [
    { name: 'Aditi', mobile: '9876543210', visit_count: 5, outlets: ['Basque'], visits: [] },
    { name: 'Neha', mobile: '9987654321', visit_count: 5, outlets: ['Kampai'], visits: [] },
    { name: 'Rohan', mobile: '9765432109', visit_count: 6, outlets: ['Basque'], visits: [] }
  ];`, context);
  element('#customer-visit-filter').value = 'exact';
  element('#customer-exact-visits').value = '5';
  vm.runInContext('renderCustomerReport()', context);
  const rows = element('#customer-report-rows');
  assert.equal(rows.children.length, 2);
  assert.match(rows.children[0].children[0].textContent, /Aditi/);
  assert.match(element('#customer-report-result-count').textContent, /2 customers/);
  element('#guest-search').value = '9876543210';
  vm.runInContext('renderCustomerReport()', context);
  assert.equal(rows.children.length, 1);
  assert.match(element('#customer-report-result-count').textContent, /1 customer/);
  element('#guest-search').value = '';
  element('#customer-exact-visits').value = '6';
  vm.runInContext('renderCustomerReport()', context);
  assert.match(rows.children[0].children[0].textContent, /Rohan/);
  for (const invalid of ['', '0', '1.5', '-1']) {
    element('#customer-exact-visits').value = invalid;
    vm.runInContext('renderCustomerReport()', context);
    assert.match(rows.children[0].textContent, /positive whole number/i);
  }
});
