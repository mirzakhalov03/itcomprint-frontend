const DEFAULT_DPI = 203; // confirm on the Gainscha; 'PLUS' units may be 300

const LABEL_WIDTH_MM = 80;
const LABEL_HEIGHT_MM = 60;

export function buildBadgeTSPL(name: string, dpi: number = DEFAULT_DPI): string {
  const dotsPerMm = dpi / 25.4;
  const widthDots = Math.round(LABEL_WIDTH_MM * dotsPerMm);
  const text = name.toUpperCase().replace(/"/g, "'"); // TSPL strings are double-quoted
  const yTop = Math.round(LABEL_HEIGHT_MM * dotsPerMm * 0.35);
  const blockHeight = Math.round(LABEL_HEIGHT_MM * dotsPerMm * 0.4);

  return [
    `SIZE ${LABEL_WIDTH_MM} mm, ${LABEL_HEIGHT_MM} mm`,
    'GAP 2 mm, 0 mm',
    'DIRECTION 1',
    'CLS',
    // BLOCK x,y,width,height,"font",rotation,x-mul,y-mul,space,align,"content"
    `BLOCK 0,${yTop},${widthDots},${blockHeight},"3",0,2,2,0,2,"${text}"`,
    'PRINT 1',
    '',
  ].join('\n');
}
