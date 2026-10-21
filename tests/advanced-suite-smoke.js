const fs = require('fs');
const vm = require('vm');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>')) + '\nglobalThis.S=state;';
const elements = { app: { innerHTML: '' }, toast: { textContent: '', classList: { add() {}, remove() {} } } };
global.window = { location: { origin: 'http://localhost:4175', search: '', pathname: '/' }, history: { replaceState() {} }, confirm() { return true; }, addEventListener() {} };
global.navigator = { onLine: false };
global.localStorage = { getItem() { return null; }, setItem() {} };
global.NodeFilter = { SHOW_TEXT: 4 };
global.document = { documentElement: {}, body: { dataset: {} }, hidden: false, getElementById(id) { return elements[id] || null; }, createTreeWalker() { return { nextNode() { return null; } }; }, addEventListener() {}, querySelector() { return null; }, createElement() { return { click() {}, remove() {} }; } };
vm.runInThisContext(source, { filename: 'advanced-suite-smoke.js' });

const project = normalizeProject({ id: 'project-test', name: 'آزمون پروژه', dailyCapacityMinutes: 120 });
S.projects = [project]; S.activeProjectId = project.id;
S.tasks = [
  normalizeTask({ id: 701, title: 'پایه', projectId: project.id, date: '2020-01-01', duration: 60, stage: 'backlog' }),
  normalizeTask({ id: 702, title: 'وابسته', projectId: project.id, date: '2020-01-01', duration: 60, stage: 'backlog', blockedBy: [701] })
];
S.page = 'projects'; render();
if (!elements.app.innerHTML.includes('project-board') || !elements.app.innerHTML.includes('kanban-column')) throw new Error('Project board missing');
moveProjectTask(702, 'done'); if (S.tasks.find(task => task.id === 702).done) throw new Error('Dependency guard failed');
moveProjectTask(701, 'done'); moveProjectTask(702, 'done'); if (!S.tasks.every(task => task.done)) throw new Error('Kanban completion failed');
S.tasks.forEach(task => { task.done = false; task.stage = 'backlog'; task.date = '2020-01-01'; }); autoScheduleProject(project.id);
if (S.tasks.find(task => task.id === 701).date < todayISO()) throw new Error('Capacity scheduling failed');

S.flashcards = [normalizeFlashcard({ id: 801, subject: 'احتمال', front: 'سوال', back: 'پاسخ', dueDate: '2026-01-01', lapses: 2 })];
S.mastery = { 'احتمال::شرطی': { level: 0, attempts: 1 } };
S.errorLogs = [{ subject: 'احتمال', note: 'خطا', date: todayISO() }];
S.examTargets = [normalizeExamTarget({ id: 'exam-test', subject: 'احتمال', date: isoFromToday(10), goal: 3 })];
S.page = 'learn'; render(); if (!elements.app.innerHTML.includes('learning-pro')) throw new Error('Learning Pro missing');
startExamDrill('exam-test'); revealExamDrill(); gradeExamDrill(true);
if (!S.examTargets[0].history.length || S.examTargets[0].history[0].score !== 100) throw new Error('Exam drill scoring failed');
S.account = { token: 'demo-token', email: 'owner@example.test', name: 'Owner' }; ensureCollaborationState();
const remoteProject = { id: 'team-test', revision: 3, updatedAt: new Date().toISOString(), updatedBy: 'editor@example.test', members: { 'owner@example.test': { role: 'owner' } }, payload: { project: { name: 'پروژهٔ مشترک', dailyCapacityMinutes: 90 }, tasks: [{ id: 'remote-task-1', title: 'کار مشترک', date: todayISO(), duration: 45, stage: 'backlog' }] } };
applySharedProject(remoteProject, project.id);
if (projectCollaboration(project.id)?.revision !== 3 || !S.tasks.some(task => task.collabRemoteId === 'remote-task-1')) throw new Error('Collaboration project mapping failed');
S.page = 'projects'; render();
if (!elements.app.innerHTML.includes('collab-panel') || !elements.app.innerHTML.includes('پروژهٔ تیمی متصل')) throw new Error('Collaboration panel missing');
console.log('Advanced project, collaboration, and learning suite smoke test passed');
