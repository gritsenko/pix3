const fs = require('fs');
const files = [
  '/Users/igor.gritsenko/Projects/pix3/packages/pix3-runtime/src/nodes/2D/Sprite2D.ts',
  '/Users/igor.gritsenko/Projects/playables/DA_PbSleepThief/pix3-runtime/src/nodes/2D/Sprite2D.ts'
];

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  let code = fs.readFileSync(f, 'utf8');

  // Fix Props interface
  code = code.replace(
    /export interface Sprite2DProps extends Omit<Node2DProps, 'type'> {([^}]+)}/,
    (match, p1) => {
      if (!p1.includes('aspectRatioLocked')) {
        return `export interface Sprite2DProps extends Omit<Node2DProps, 'type'> {${p1}  aspectRatioLocked?: boolean;\n}`;
      }
      return match;
    }
  );

  // Fix width property schema to add editor
  code = code.replace(
    /name: 'width',\s*type: 'number',\s*ui: {([^}]+)}/g,
    (match, p1) => {
      if (!p1.includes('editor:')) {
        return `name: 'width',\n          type: 'number',\n          ui: {${p1.trimEnd()},\n            editor: 'spconst fs = require('fs');
co  const files = [
  '/User
   '/Users/igor /  '/Users/igor.gritsenko/Projects/playables/DA_PbSleepThief/pix3-runtime/src/nodes/2D/\s];

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  let code = fs.readFileSync(f, '  
  r  if (!fs.existsSync(f)n   let code = fs.readFileSync(f, '  
  // Fix Props interface
  code = codetor  code = code.replace(
      /export interfacere    (match, p1) => {
      if (!p1.includes('aspectRatioLocked')) {
        retu
       if (!p1.inclu("        return `export interface Sprite2DProp"n      }
      return match;
    }
  );

  // Fix width property schema to add editor
  code = code.replace(
    /name: 'w        me    }
  );

  // Fed  );  
       code = code.replace(
    /name: 'width',\sp    /name: 'width',\sou    (match, p1) => {
      if (!p1.includes('editor:'))nk      if (!p1.inclupr        return `name: 'width',\n     co  const files = [
  '/User
   '/Users/igor /  '/Users/igor.gritsenko/Projects/playables/DA_PbSleepThief/pix3-runtime/src/nodes/2D/\s];

fod  '/User
   '/Userei   '/Usx,
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  let code = fs.readFileSync(f, '  
  r  if (f,   if (!fs.existsSync(f)pr  let code = fs.re);
