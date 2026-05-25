import { defineCustomElement } from 'vue'
import ObservabilityCopilot from './ObservabilityCopilot.ce.vue'

const tagName = 'observability-copilot'
const ObservabilityCopilotElement = defineCustomElement(ObservabilityCopilot)

if (!customElements.get(tagName)) {
  customElements.define(tagName, ObservabilityCopilotElement)
}

export { ObservabilityCopilotElement }
