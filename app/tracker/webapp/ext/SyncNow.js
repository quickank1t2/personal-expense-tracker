sap.ui.define([
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (MessageToast, MessageBox) {
  "use strict";

  return {
    /**
     * List Report table toolbar action: run classification rules over all
     * expenses. `syncNow` is an unbound OData V4 action at the service root.
     *
     * In a Fiori Elements custom action the handler is invoked with `this`
     * bound to the extension API; it receives the (optional) current context
     * and the selected contexts.
     */
    onSyncNow: function (oContext, aSelectedContexts) {
      var oExtensionAPI = this;
      // Resolve the OData V4 model from whatever context is available.
      var oModel = (oContext && oContext.getModel && oContext.getModel()) ||
        (aSelectedContexts && aSelectedContexts[0] && aSelectedContexts[0].getModel()) ||
        (oExtensionAPI.getModel && oExtensionAPI.getModel());

      if (!oModel) {
        MessageBox.error("Sync failed: OData model not available.");
        return;
      }

      var oAction = oModel.bindContext("/syncNow(...)");
      oAction.execute().then(function () {
        var oResult = oAction.getBoundContext().getObject() || {};
        MessageToast.show("Sync complete — " + (oResult.changed || 0) + " expense(s) updated.");
        if (oExtensionAPI.refresh) {
          oExtensionAPI.refresh();
        }
      }).catch(function (oError) {
        MessageBox.error("Sync failed: " + (oError && oError.message ? oError.message : String(oError)));
      });
    }
  };
});
