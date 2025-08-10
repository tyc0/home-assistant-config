document.addEventListener('DOMContentLoaded', function () {
  const button = document.querySelector('button');
  if (button) {
    button.addEventListener('click', function () {
      const input = document.getElementById('floating_outlined');
      const newItem = input.value.trim();
      if (newItem) {
        const hass = document.querySelector('home-assistant').shadowRoot.querySelector('home-assistant-main').hass;
        hass.callService('input_text', 'set_value', {
          entity_id: 'input_text.todo_test_list', // Make sure this entity_id exists
          value: newItem
        });
        input.value = ''; // Clear the input after adding
      }
    });
  }
});
