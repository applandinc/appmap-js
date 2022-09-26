context('Project Picker (Four Projects)', () => {
  beforeEach(() => {
    cy.visit(
      'http://localhost:6006/iframe.html?id=pages-vs-code-install-guide-pages-project-picker--four-projects&args=&viewMode=story'
    );
  });

  it('displays a title', () => {
    cy.get('[data-cy="title"]').should('contain.text', 'Install AppMap');
  });

  it('does not show empty state content', () => {
    cy.get('[data-cy="empty-state-content').should('not.exist');
  });

  it('displays a message indicating that there are multiple projects', () => {
    cy.get('[data-cy="multiple-projects-text"]').should('contain.text', 'multiple projects');
  });

  it('has four rows', () => {
    cy.get('[data-cy="project-picker-row"]').should('have.length', 4);
  });

  it('does not show requirements before selecting a project', () => {
    cy.get('[data-cy="requirements-title"]').should('not.exist');
  });

  it('shows instructions after selecting a project', () => {
    cy.get('[data-cy="project-picker-row"]').first().click();
    cy.get('[data-cy="automated-install"]').should('be.visible');
    cy.get('[data-cy="manual-install"]').should('be.visible');
  });

  it('shows next button when selecting a good project', () => {
    cy.get('[data-score="good"]').first().click();
    cy.get('[data-score="good"] [data-cy="next-button"]').should('be.visible');
  });

  it('does not show back button when selecting a good project', () => {
    cy.get('[data-score="good"]').first().click();
    cy.get('[data-score="good"] [data-cy="back-button"]').should('not.exist');
  });

  it('shows code snippet when selecting a good project', () => {
    cy.get('[data-score="good"]').first().click();
    cy.get('[data-score="good"] [data-cy="code-snippet"]').should('be.visible');
  });

  it('shows next button when selecting an ok project', () => {
    cy.get('[data-score="ok"]').first().click();
    cy.get('[data-score="ok"] [data-cy="next-button"]').should('be.visible');
  });

  it('does not show back button when selecting an ok project', () => {
    cy.get('[data-score="ok"]').first().click();
    cy.get('[data-score="ok"] [data-cy="back-button"]').should('not.exist');
  });

  it('shows code snippet when selecting an ok project', () => {
    cy.get('[data-score="ok"]').first().click();
    cy.get('[data-score="ok"] [data-cy="code-snippet"]').should('be.visible');
  });

  it('should not show next button when selecting a bad project', () => {
    cy.get('[data-score="bad"]').first().click();
    cy.get('[data-score="bad"] [data-cy="next-button"]').should('not.exist');
  });

  it('should not show back button when selecting a bad project', () => {
    cy.get('[data-score="bad"]').first().click();
    cy.get('[data-score="bad"] [data-cy="back-button"]').should('not.exist');
  });

  it('bad project does not contain a call to action', () => {
    cy.get('[data-score="bad"]').first().click();
    cy.get('[data-score="bad"] button').should('not.exist');
    cy.get('[data-score="bad"] [data-cy="code-snippet"]').should('not.exist');
  });
});
