describe('App', () => {
  it('redirige a /login cuando no hay sesión', () => {
    cy.visit('/dashboard');
    cy.url().should('include', '/login');
  });

  it('muestra la página de login', () => {
    cy.visit('/login');
    cy.get('input[type="email"], input[formcontrolname="email"]').should('be.visible');
  });
});
