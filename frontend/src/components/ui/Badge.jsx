/**
 * Merender label status ringkas dengan gaya visual berdasarkan variasi yang diberikan.
 */


/**
 * Merender komponen badge dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function Badge({ children, tone = 'neutral', className = '' }) {
  const classes = ['badge', `badge-${tone}`, className].filter(Boolean).join(' ');
  return <span className={classes}>{children}</span>;
}
