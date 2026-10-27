import { ChangeDetectionStrategy, Component } from '@angular/core';
import { COUNTRIES } from './demo-form';

/** Campos de morada e NIF usados nas encomendas, sócias e donativos. */
@Component({
  selector: 'ar-address-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'form-grid wide' },
  template: `
    <div class="field wide">
      <label for="morada">Morada</label>
      <input id="morada" name="morada" autocomplete="street-address" required />
    </div>
    <div class="field">
      <label for="cp">Código postal</label>
      <input
        id="cp"
        name="cp"
        autocomplete="postal-code"
        inputmode="numeric"
        pattern="\\d{4}-?\\d{3}"
        placeholder="0000-000"
        required
      />
    </div>
    <div class="field">
      <label for="localidade">Localidade</label>
      <input id="localidade" name="localidade" autocomplete="address-level2" required />
    </div>
    <div class="field">
      <label for="pais">País</label>
      <select id="pais" name="pais" autocomplete="country-name">
        @for (c of countries; track c) {
          <option>{{ c }}</option>
        }
      </select>
    </div>
    <div class="field">
      <label for="nif">NIF <span class="hint">(opcional, para a fatura)</span></label>
      <input id="nif" name="nif" inputmode="numeric" pattern="\\d{9}" maxlength="9" />
    </div>
  `,
})
export class AddressFieldsComponent {
  protected readonly countries = COUNTRIES;
}
