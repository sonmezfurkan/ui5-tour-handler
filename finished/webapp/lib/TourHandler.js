sap.ui.define([
  "sap/m/Popover",
  "sap/m/PlacementType",
  "sap/m/Text",
  "sap/m/Button",
  "sap/m/ButtonType",
  "sap/m/FlexBox",
  "sap/m/FlexJustifyContent",
  "sap/ui/core/Icon",
  "sap/ui/core/IconColor"
], function(Popover, PlacementType, Text, Button, ButtonType, FlexBox, FlexJustifyContent, Icon, IconColor) {
  "use strict"

  return {
    /**
     * Entry point of the tour handler
     * Must be called by passing in the component object of an application
     */
    init(oComponent) {
      this._oComponent = oComponent
      this._oRouter = oComponent.getRouter()

      // If there is a router configured, listen for the "created" event
      // of the router to access the view once it has been created
      // Else, get the root view of the component
      if (this._oRouter) {
        this._oRouter.getViews().attachEventOnce("created", oEvent => {
          // Get the view from the event
          const oView = oEvent.getParameter("view")

          // Attach "afterRendering" event on the view
          // We have to wait for the rendering to have access to DOM
          oView.attachEventOnce("afterRendering", () => {
            this._startTour()
          })
        })
      } else {
        const oView = this._oComponent.getRootControl()

        oView.attachEventOnce("afterRendering", () => {
          this._startTour()
        })
      }
    },

    _startTour() {
      // First check if tour has been completed or skipped
      const oTourCompletedOrSkipped = localStorage.getItem(this._oComponent.getId())

      if (oTourCompletedOrSkipped) {
        console.log("Looks like a tour for this app has been completed or skipped already, aborting")
        return
      }

      // Find all controls marked for a tour
      // Get only visible controls since some could be hidden due to access rights etc
      const aMarked = sap.ui.core.Element.registry.filter(
        oControl =>
          oControl.getVisible &&
          oControl.getVisible() &&
          oControl.getCustomData &&
          oControl.getCustomData().length &&
          oControl.getCustomData().some(oCustomData => oCustomData.getKey() === "ux-tour-index")
      )

      // If there are no controls found, abort
      if (!aMarked.length) {
        console.log("No controls found for the tour, aborting")
        return
      } else {
        console.log(`${aMarked.length} Controls found for the tour`)
      }

      // Create tour assets
      this._createTourAssets()

      // Save the tour related data on the control and sort them by index
      this._aContols = aMarked
        .map(oControl => {
          // Extract custom data
          const oCustomDataIndex = oControl.getCustomData().find(oCustomData => oCustomData.getKey() === "ux-tour-index")
          const oCustomDataDesc = oControl.getCustomData().find(oCustomData => oCustomData.getKey() === "ux-tour-desc")

          // Attach the data to the control so we can access it easily later on
          oControl.tour = {
            index: +oCustomDataIndex.getValue(),
            description: oCustomDataDesc.getValue()
          }

          return oControl
        })
        .sort((el1, el2) => (el1.tour.index > el2.tour.index ? 1 : -1))

        // Set progress indicator
        const oStepIndicator = this._oPopover.getContent()[1]

        this._aContols.forEach(() => {
          oStepIndicator.addItem(
            new Icon({
              src: "sap-icon://circle-task-2",
              size: ".75rem"
            }).addStyleClass("sapUiTinyMarginEnd")
          )
        })

        // Initialize the tour index by -1
        this._iIndex = -1

        // Start the tour from the first control
        this._highlightNextControl()
    },

    /**
     * Highlights the next control in the array
     */
    _highlightNextControl() {
      // Increase index by one
      this._iIndex += 1

      // Get the control to be highlighted
      const oControl = this._aContols[this._iIndex]

      // Check if this is the last element
      const bLastControl = this._iIndex + 1 === this._aContols.length

      // Position the div onto the control
      this._positionHoledDiv(oControl)

      // Update next button text for the final control
      // And do not display the skip button
      if (bLastControl) {
        this._oPopover.getEndButton().setText("Done")
        this._oPopover.getBeginButton().setVisible(false)
      }

      // Set next button press handler
      this._oPopover.getEndButton().attachEventOnce(
        "press",
        bLastControl ? this._endTour.bind(this) : this._highlightNextControl.bind(this)
      )

      // Set active step
      this._oPopover
        .getContent()[1]
        .getItems()
        .forEach((oItem, iIndex) => {
          oItem.setColor(iIndex === this._iIndex ? IconColor.Default : IconColor.Neutral)
        })

      // Show description popover
      this._oPopover.getContent()[0].setText(oControl.tour.description)

      if (this._oPopover.isOpen()) this._oPopover.close()

      this._oPopover.openBy(oControl)
      
      // Handle control size/position change
      // Disconnect from any existing observers
      if (this._oObserver) this._oObserver.disconnect()

      this._oObserver = new MutationObserver(() => {
        this._positionHoledDiv(oControl)
      })

      this._oObserver.observe(oControl.getDomRef(), {
        attributes: true,
        childList: false,
        subtree: false
      })
    },

    _positionHoledDiv(oControl) {
      // First we get the size and position of the control
      const { width, height, top, left } = oControl.getDomRef().getBoundingClientRect()

      // Position div
      this._$OverlayHoled.css("width", width)
      this._$OverlayHoled.css("height", height)
      this._$OverlayHoled.css("top", top)
      this._$OverlayHoled.css("left", left)
      this._$OverlayHoled.css("border-radius", oControl.$().css("border-radius"))
    },

    /**
     * Create tour related DOM elements and UI5 controls
     */
    _createTourAssets() {
      // Create a transparent div wiht a huge box shadow
      // Size and position this div on top of the control
      // That way the control will be visible and the rest of the screen will look dimmed by the shadow
      // Will call this div "_$OverlayHoled" since it will look like a div with a hole in it
      this._$OverlayHoled = $("<div>")
      this._$OverlayHoled.css("position", "fixed")
      this._$OverlayHoled.css("box-shadow", "0 0 0 100vmax rgba(0,0,0,.4)")
      this._$OverlayHoled.css("pointer-events", "none")
      this._$OverlayHoled.css("transition", "all .2s")
      this._$OverlayHoled.appendTo($("body"))

      // Create an invisible clickable overlay to end the tour when clicked
      this._$Overlay = $("<div>")
      this._$Overlay.css("position", "fixed")
      this._$Overlay.css("top", "0")
      this._$Overlay.css("left", "0")
      this._$Overlay.css("width", "100vw")
      this._$Overlay.css("height", "100vh")
      this._$Overlay.css("cursor", "pointer")
      this._$Overlay.css("opacity", "0")
      this._$Overlay.css("z-index", "5")
      this._$Overlay.click(this._endTour.bind(this))
      this._$Overlay.appendTo($("body"))

      // Create a popover control to be used to display info about the highlighted control
      // It will also contain the "next" and "skip" buttons
      this._oPopover = new Popover({
        placement: PlacementType.Auto,
        showHeader: true,
        content: [
          new Text(), // Empty text, to be filled later
          new FlexBox({
            justifyContent: FlexJustifyContent.Center
          }).addStyleClass("sapUiMediumMarginTop sapUiTinyMarginBottom")
        ],
        beginButton: new Button({
          text: "Skip",
          press: this._endTour.bind(this)
        }),
        endButton: new Button({
          type: ButtonType.Emphasized,
          text: "Next"
        })
      }).addStyleClass("sapUiResponsiveContentPadding")

      this._oPopover.$().css("max-width", "40rem")
    },

    /**
     * End tour
     */
    _endTour() {
      // Remove overlays
      this._$OverlayHoled.remove()
      this._$Overlay.remove()

      // Destroy popover
      this._oPopover.destroy()

      // Disconnect from existing observer
      if (this._oObserver) this._oObserver.disconnect()

      // Set local storage item to indicate the tour has been completed or skipped
      localStorage.setItem(this._oComponent.getId(), 1)
    }
  }
})