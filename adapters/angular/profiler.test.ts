import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angularProfiler, className, templateLabel } from './profiler.ts';
import { ViewSpans, FRAMEWORK, type ViewRun } from '../../core/collectors/views.ts';

test('templateLabel: komponens és az utolsó két blokk', () => {
  assert.equal(templateLabel('EventRowComponent_Template'), 'EventRowComponent');
  assert.equal(templateLabel('LiveScreen_Conditional_12_For_8_Template'), 'LiveScreen @if[12] › @for[8]');
  assert.equal(templateLabel('LiveScreen_Conditional_11_ng_template_1_Conditional_0_Template'), 'LiveScreen <ng-template>[1] › @if[0]');
  assert.equal(templateLabel('AppComponent_Case_10_DeferPlaceholder_1_Template'), 'AppComponent @case[10] › @placeholder[1]');
  assert.equal(templateLabel('BetSlipComponent_Conditional_9_For_4_Template_button_click_2_listener'), 'BetSlipComponent @if[9] › @for[4]');
  assert.equal(templateLabel('ngOnInit'), '');
  assert.equal(templateLabel(''), '');
});

test('className: az esbuild aláhúzás-előtagja nélkül', () => {
  class _EventRowComponent {}
  assert.equal(className(new _EventRowComponent()), 'EventRowComponent');
  assert.equal(className(null), '?');
});

test('angularProfiler: egy tick komponensekre és sablon-részekre bontva', () => {
  class _ListComponent {}
  class _RowComponent {}
  const list = new _ListComponent(), row = new _RowComponent();
  function ListComponent_Template() {}
  function ListComponent_For_3_Template() {}
  function RowComponent_Template() {}
  function ngDoCheck() {}
  const runs: ViewRun[] = [];
  let clock = 0;
  const p = angularProfiler(new ViewSpans((r) => runs.push(r)), () => clock);
  const at = (t: number, e: number, inst?: unknown, fn?: unknown) => { clock = t; p(e, inst, fn); };

  at(0, 12);                                         // ChangeDetectionStart
  at(1, 14);                                         //  SyncStart
  at(2, 18);                                         //   ComponentStart (List)
  at(3, 2, list, ListComponent_Template);            //    TemplateUpdateStart (gyökér)
  at(5, 3, list, ListComponent_Template);            //    …End: 2 ms
  at(5, 2, {}, ListComponent_For_3_Template);        //    egy sor-sablon
  at(15, 3, {}, ListComponent_For_3_Template);       //    …10 ms
  at(15, 4, row, ngDoCheck);                         //    RowComponent.ngDoCheck
  at(16, 5, row, ngDoCheck);                         //    …1 ms
  at(16, 18);                                        //    ComponentStart (Row)
  at(17, 2, row, RowComponent_Template);
  at(37, 3, row, RowComponent_Template);             //     20 ms
  at(38, 19, row);                                   //    ComponentEnd (Row): 22 ms, ebből 20 sablon
  at(40, 19, list);                                  //   ComponentEnd (List): 38 ms
  at(41, 15);                                        //  SyncEnd
  assert.equal(runs.length, 0);
  at(42, 13);                                        // ChangeDetectionEnd

  assert.equal(runs.length, 1);
  const by = Object.fromEntries(runs[0].views.map((v) => [v.label, [v.ms, v.count]]));
  assert.equal(runs[0].kind, 'tick');
  assert.equal(runs[0].dur, 42);
  assert.deepEqual(by['RowComponent'], [22, 1]);               // 2 keret + 20 gyökérsablon, egy ellenőrzés
  assert.deepEqual(by['ListComponent @for[3]'], [10, 1]);
  assert.deepEqual(by['ListComponent'], [5, 1]);               // 2 gyökérsablon + (38 − 2 − 10 − 1 − 22) keret
  assert.deepEqual(by['RowComponent ngDoCheck()'], [1, 1]);
  assert.deepEqual(by[FRAMEWORK], [4, 0]);                     // (40 − 38) sync-keret + (42 − 40) tick-keret
});

test('angularProfiler: output-kezelő futás-keret nélkül is futás', () => {
  class _BtnComponent {}
  function BtnComponent_Template_button_click_0_listener() {}
  const runs: ViewRun[] = [];
  let clock = 0;
  const p = angularProfiler(new ViewSpans((r) => runs.push(r)), () => clock);
  clock = 10; p(6, new _BtnComponent(), BtnComponent_Template_button_click_0_listener);
  clock = 25; p(7, new _BtnComponent(), BtnComponent_Template_button_click_0_listener);
  assert.deepEqual([runs[0].kind, runs[0].dur, runs[0].views[0].label], ['output', 15, 'BtnComponent (listener)']);
});
