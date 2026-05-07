// E2E tests for the public player fee payment page (/player-fee/:token)
// API calls are intercepted — no real DB or MercadoPago needed.

const TOKEN = 'test-token-abc';
const BASE = '/api/v1/player-fees/public';

const publicInfo = {
  linkToken: TOKEN,
  label: 'Derecho Rugby 2025',
  description: 'Pago anual',
  season: '2025',
  sport: 'rugby',
};

const validateResult = {
  playerId: 'player-1',
  playerName: 'Juan Pérez',
  playerDni: '12345678',
  category: 'plantel_superior',
  blockName: 'PS',
  originalAmount: 10000,
  finalAmount: 10000,
  totalAmount: 10000,
  alreadyPaid: false,
};

const validateResultWithDiscount = {
  ...validateResult,
  category: 'm15',
  blockName: 'M15',
  originalAmount: 7000,
  discountPct: 25,
  discountReason: '2do integrante del grupo familiar',
  finalAmount: 5250,
  totalAmount: 5250,
};

const validateResultPaid = {
  ...validateResult,
  alreadyPaid: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function interceptPublicInfo(response: object = publicInfo) {
  cy.intercept('GET', `${BASE}/${TOKEN}`, { statusCode: 200, body: response }).as('getInfo');
}

function interceptValidate(response: object, status = 200) {
  cy.intercept('POST', `${BASE}/${TOKEN}/validate`, { statusCode: status, body: response }).as('validate');
}

function interceptCheckout(checkoutUrl = 'https://sandbox.mercadopago.com/checkout/123') {
  cy.intercept('POST', `${BASE}/${TOKEN}/checkout`, { statusCode: 201, body: { checkoutUrl } }).as('checkout');
}

function visitPage() {
  cy.visit(`/player-fee/${TOKEN}`);
  cy.wait('@getInfo');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Página de Derecho de Jugador', () => {

  describe('Carga inicial', () => {
    it('muestra el label y temporada cuando la config carga correctamente', () => {
      interceptPublicInfo();
      visitPage();

      cy.contains('Derecho Rugby 2025').should('be.visible');
      cy.contains('Temporada 2025').should('be.visible');
      cy.contains('Pago anual').should('be.visible');
    });

    it('muestra el campo de DNI al cargar', () => {
      interceptPublicInfo();
      visitPage();

      cy.get('input[placeholder="Sin puntos"]').should('be.visible');
      cy.contains('button', 'Continuar').should('be.visible');
    });

    it('muestra error cuando el link no existe o está inactivo', () => {
      cy.intercept('GET', `${BASE}/${TOKEN}`, { statusCode: 404, body: { message: 'Not found' } }).as('getInfo');
      cy.visit(`/player-fee/${TOKEN}`);
      cy.wait('@getInfo');

      cy.get('.status-message--error').should('be.visible');
    });
  });

  describe('Validación de DNI', () => {
    beforeEach(() => {
      interceptPublicInfo();
      visitPage();
    });

    it('deshabilita Continuar con DNI vacío', () => {
      cy.contains('button', 'Continuar').should('be.disabled');
    });

    it('muestra error de validación con DNI demasiado corto', () => {
      cy.get('input[placeholder="Sin puntos"]').type('123');
      cy.contains('button', 'Continuar').click();
      cy.contains('DNI inválido').should('be.visible');
    });

    it('muestra los datos del jugador tras validar correctamente', () => {
      interceptValidate(validateResult);

      cy.get('input[placeholder="Sin puntos"]').type('12345678');
      cy.contains('button', 'Continuar').click();
      cy.wait('@validate');

      cy.contains('Jugador verificado').should('be.visible');
      cy.contains('Juan Pérez').should('be.visible');
      cy.contains('12345678').should('be.visible');
      cy.contains('$ 10.000').should('be.visible');
    });

    it('muestra "Jugadora verificada" para hockey', () => {
      interceptPublicInfo({ ...publicInfo, sport: 'hockey' });
      cy.visit(`/player-fee/${TOKEN}`);
      cy.wait('@getInfo');

      interceptValidate(validateResult);
      cy.get('input[placeholder="Sin puntos"]').type('12345678');
      cy.contains('button', 'Continuar').click();
      cy.wait('@validate');

      cy.contains('Jugadora verificada').should('be.visible');
    });

    it('muestra mensaje de ya pagado cuando alreadyPaid es true', () => {
      interceptValidate(validateResultPaid);

      cy.get('input[placeholder="Sin puntos"]').type('12345678');
      cy.contains('button', 'Continuar').click();
      cy.wait('@validate');

      cy.contains('¡Ya registraste tu pago!').should('be.visible');
      cy.contains('Juan Pérez').should('be.visible');
    });

    it('muestra error cuando el DNI no pertenece a ningún jugador', () => {
      interceptValidate({ message: 'No se encontró un jugador con ese DNI', statusCode: 404, error: 'Not Found' }, 404);

      cy.get('input[placeholder="Sin puntos"]').type('99999999');
      cy.contains('button', 'Continuar').click();
      cy.wait('@validate');

      cy.contains('No se encontró un jugador con ese DNI').should('be.visible');
    });

    it('muestra error cuando la categoría venció', () => {
      interceptValidate({ message: 'El plazo de pago para tu categoría ha vencido', statusCode: 400, error: 'Bad Request' }, 400);

      cy.get('input[placeholder="Sin puntos"]').type('12345678');
      cy.contains('button', 'Continuar').click();
      cy.wait('@validate');

      cy.get('.error-text, .status-message--error').should('contain', 'plazo de pago');
    });
  });

  describe('Descuento familiar', () => {
    beforeEach(() => {
      interceptPublicInfo();
      visitPage();
    });

    it('muestra el descuento y el total reducido cuando aplica', () => {
      interceptValidate(validateResultWithDiscount);

      cy.get('input[placeholder="Sin puntos"]').type('12345678');
      cy.contains('button', 'Continuar').click();
      cy.wait('@validate');

      cy.contains('Descuento (25%)').should('be.visible');
      cy.contains('2do integrante del grupo familiar').should('be.visible');
      cy.contains('$ 5.250').should('be.visible');
    });

    it('no muestra sección de descuento cuando no aplica', () => {
      interceptValidate(validateResult);

      cy.get('input[placeholder="Sin puntos"]').type('12345678');
      cy.contains('button', 'Continuar').click();
      cy.wait('@validate');

      cy.contains('Descuento').should('not.exist');
    });
  });

  describe('Flujo de pago', () => {
    beforeEach(() => {
      interceptPublicInfo();
      visitPage();
      interceptValidate(validateResult);
      cy.get('input[placeholder="Sin puntos"]').type('12345678');
      cy.contains('button', 'Continuar').click();
      cy.wait('@validate');
    });

    it('llama al endpoint de checkout al presionar Pagar', () => {
      interceptCheckout();

      cy.contains('button', 'Pagar').click();
      cy.wait('@checkout');

      cy.get('@checkout.all').should('have.length', 1);
    });

    it('permite cambiar el DNI volviendo al formulario', () => {
      cy.contains('button', 'No soy yo — cambiar DNI').click();

      cy.get('input[placeholder="Sin puntos"]').should('be.visible');
      cy.contains('Jugador verificado').should('not.exist');
    });
  });
});
