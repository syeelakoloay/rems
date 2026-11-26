/**
 * Menyediakan wadah card bersama untuk menjaga struktur dan tampilan panel tetap konsisten.
 */


/**
 * Merender komponen card dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function Card({ children, className = '', padded = true, ...rest }) {
  const classes = ['glass-card', padded ? 'card-padded' : '', className].filter(Boolean).join(' ');
  return (
    <section className={classes} {...rest}>
      {children}
    </section>
  );
}
