import { createSelectorHook, createState } from '@state-designer/react'
import * as vec from 'utils/vec'
import inputs from './inputs'
import { defaultDocument } from './data'
import { createShape, getShapeUtils } from 'lib/shape-utils'
import history from 'state/history'
import * as Sessions from './sessions'
import commands from './commands'
import { updateFromCode } from 'lib/code/generate'
import {
  clamp,
  getChildren,
  getCommonBounds,
  getCurrent,
  getCurrentCamera,
  getPage,
  getSelectedBounds,
  getSelectedShapes,
  getShape,
  screenToWorld,
  setZoomCSS,
  translateBounds,
  getParentOffset,
  getParentRotation,
  rotateBounds,
  getBoundsCenter,
  getDocumentBranch,
  getCameraZoom,
} from 'utils/utils'
import {
  Data,
  PointerInfo,
  Shape,
  ShapeType,
  Corner,
  Edge,
  CodeControl,
  MoveType,
  ShapeStyles,
  DistributeType,
  AlignType,
  StretchType,
  DashStyle,
  SizeStyle,
  ColorStyle,
} from 'types'
import session from './session'

const initialData: Data = {
  isReadOnly: false,
  settings: {
    fontSize: 13,
    isDarkMode: false,
    isCodeOpen: false,
    isStyleOpen: false,
    isToolLocked: false,
    isPenLocked: false,
    nudgeDistanceLarge: 10,
    nudgeDistanceSmall: 1,
  },
  currentStyle: {
    size: SizeStyle.Medium,
    color: ColorStyle.Black,
    dash: DashStyle.Solid,
    isFilled: false,
  },
  activeTool: 'select',
  brush: undefined,
  boundsRotation: 0,
  pointedId: null,
  hoveredId: null,
  selectedIds: new Set([]),
  currentPageId: 'page1',
  currentParentId: 'page1',
  currentCodeFileId: 'file0',
  codeControls: {},
  document: defaultDocument,
  pageStates: {
    page1: {
      camera: {
        point: [0, 0],
        zoom: 1,
      },
    },
    page2: {
      camera: {
        point: [0, 0],
        zoom: 1,
      },
    },
  },
}

const state = createState({
  data: initialData,
  on: {
    UNMOUNTED: [{ unless: 'isReadOnly', do: 'forceSave' }, { to: 'loading' }],
  },
  initial: 'loading',
  states: {
    loading: {
      on: {
        MOUNTED: [
          'restoreSavedData',
          {
            to: 'ready',
          },
        ],
      },
    },
    ready: {
      onEnter: {
        wait: 0.01,
        if: 'hasSelection',
        do: 'zoomCameraToSelectionActual',
        else: ['zoomCameraToFit', 'zoomCameraToActual'],
      },
      on: {
        ZOOMED_CAMERA: {
          do: 'zoomCamera',
        },
        PANNED_CAMERA: {
          do: 'panCamera',
        },
        ZOOMED_TO_ACTUAL: {
          if: 'hasSelection',
          do: 'zoomCameraToSelectionActual',
          else: 'zoomCameraToActual',
        },
        ZOOMED_TO_SELECTION: {
          if: 'hasSelection',
          do: 'zoomCameraToSelection',
        },
        ZOOMED_TO_FIT: ['zoomCameraToFit', 'zoomCameraToActual'],
        ZOOMED_IN: 'zoomIn',
        ZOOMED_OUT: 'zoomOut',
        RESET_CAMERA: 'resetCamera',
        TOGGLED_SHAPE_LOCK: { if: 'hasSelection', do: 'lockSelection' },
        TOGGLED_SHAPE_HIDE: { if: 'hasSelection', do: 'hideSelection' },
        TOGGLED_SHAPE_ASPECT_LOCK: {
          if: 'hasSelection',
          do: 'aspectLockSelection',
        },
        SELECTED_SELECT_TOOL: { to: 'selecting' },
        SELECTED_DRAW_TOOL: { unless: 'isReadOnly', to: 'draw' },
        SELECTED_ARROW_TOOL: { unless: 'isReadOnly', to: 'arrow' },
        SELECTED_DOT_TOOL: { unless: 'isReadOnly', to: 'dot' },
        SELECTED_CIRCLE_TOOL: { unless: 'isReadOnly', to: 'circle' },
        SELECTED_ELLIPSE_TOOL: { unless: 'isReadOnly', to: 'ellipse' },
        SELECTED_RAY_TOOL: { unless: 'isReadOnly', to: 'ray' },
        SELECTED_LINE_TOOL: { unless: 'isReadOnly', to: 'line' },
        SELECTED_POLYLINE_TOOL: { unless: 'isReadOnly', to: 'polyline' },
        SELECTED_RECTANGLE_TOOL: { unless: 'isReadOnly', to: 'rectangle' },
        TOGGLED_CODE_PANEL_OPEN: 'toggleCodePanel',
        TOGGLED_STYLE_PANEL_OPEN: 'toggleStylePanel',
        POINTED_CANVAS: ['closeStylePanel', 'clearCurrentParentId'],
        CHANGED_STYLE: ['updateStyles', 'applyStylesToSelection'],
        SELECTED_ALL: { to: 'selecting', do: 'selectAll' },
        NUDGED: { do: 'nudgeSelection' },
        USED_PEN_DEVICE: 'enablePenLock',
        DISABLED_PEN_LOCK: 'disablePenLock',
        CLEARED_PAGE: {
          if: 'hasSelection',
          do: 'deleteSelection',
          else: ['selectAll', 'deleteSelection'],
        },
        CHANGED_CURRENT_PAGE: ['clearSelectedIds', 'setCurrentPage'],
        CREATED_PAGE: ['clearSelectedIds', 'createPage'],
        DELETED_PAGE: { unless: 'hasOnlyOnePage', do: 'deletePage' },
      },
      initial: 'selecting',
      states: {
        selecting: {
          onEnter: 'setActiveToolSelect',
          on: {
            SAVED: 'forceSave',
            UNDO: 'undo',
            REDO: 'redo',
            SAVED_CODE: 'saveCode',
            DELETED: 'deleteSelection',
            INCREASED_CODE_FONT_SIZE: 'increaseCodeFontSize',
            DECREASED_CODE_FONT_SIZE: 'decreaseCodeFontSize',
            CHANGED_CODE_CONTROL: 'updateControls',
            GENERATED_FROM_CODE: ['setCodeControls', 'setGeneratedShapes'],
            TOGGLED_TOOL_LOCK: 'toggleToolLock',
            MOVED: { if: 'hasSelection', do: 'moveSelection' },
            DUPLICATED: { if: 'hasSelection', do: 'duplicateSelection' },
            ROTATED_CCW: { if: 'hasSelection', do: 'rotateSelectionCcw' },
            ALIGNED: { if: 'hasMultipleSelection', do: 'alignSelection' },
            STRETCHED: { if: 'hasMultipleSelection', do: 'stretchSelection' },
            DISTRIBUTED: {
              if: 'hasMultipleSelection',
              do: 'distributeSelection',
            },
            GROUPED: { if: 'hasMultipleSelection', do: 'groupSelection' },
            UNGROUPED: {
              if: ['hasSelection', 'selectionIncludesGroups'],
              do: 'ungroupSelection',
            },
          },
          initial: 'notPointing',
          states: {
            notPointing: {
              on: {
                CANCELLED: 'clearSelectedIds',
                STARTED_PINCHING: { to: 'pinching' },
                POINTED_CANVAS: { to: 'brushSelecting' },
                POINTED_BOUNDS: { to: 'pointingBounds' },
                POINTED_BOUNDS_HANDLE: {
                  if: 'isPointingRotationHandle',
                  to: 'rotatingSelection',
                  else: { to: 'transformingSelection' },
                },
                POINTED_HANDLE: { to: 'translatingHandles' },
                MOVED_OVER_SHAPE: {
                  if: 'pointHitsShape',
                  then: {
                    unless: 'shapeIsHovered',
                    do: 'setHoveredId',
                  },
                  else: { if: 'shapeIsHovered', do: 'clearHoveredId' },
                },
                UNHOVERED_SHAPE: 'clearHoveredId',
                DOUBLE_POINTED_SHAPE: [
                  'setDrilledPointedId',
                  'clearSelectedIds',
                  'pushPointedIdToSelectedIds',
                  {
                    to: 'pointingBounds',
                  },
                ],
                POINTED_SHAPE: [
                  {
                    if: 'isPressingMetaKey',
                    to: 'brushSelecting',
                  },
                  'setPointedId',
                  {
                    unless: 'isPointedShapeSelected',
                    then: {
                      if: 'isPressingShiftKey',
                      do: ['pushPointedIdToSelectedIds', 'clearPointedId'],
                      else: ['clearSelectedIds', 'pushPointedIdToSelectedIds'],
                    },
                  },
                  {
                    to: 'pointingBounds',
                  },
                ],
              },
            },
            pointingBounds: {
              on: {
                STOPPED_POINTING: [
                  {
                    if: 'isPressingShiftKey',
                    then: {
                      if: 'isPointedShapeSelected',
                      do: 'pullPointedIdFromSelectedIds',
                    },
                    else: {
                      unless: 'isPointingBounds',
                      do: ['clearSelectedIds', 'pushPointedIdToSelectedIds'],
                    },
                  },
                  { to: 'notPointing' },
                ],
                MOVED_POINTER: {
                  unless: 'isReadOnly',
                  if: 'distanceImpliesDrag',
                  to: 'translatingSelection',
                },
              },
            },
            rotatingSelection: {
              onEnter: 'startRotateSession',
              onExit: 'clearBoundsRotation',
              on: {
                MOVED_POINTER: 'updateRotateSession',
                PANNED_CAMERA: 'updateRotateSession',
                PRESSED_SHIFT_KEY: 'keyUpdateRotateSession',
                RELEASED_SHIFT_KEY: 'keyUpdateRotateSession',
                STOPPED_POINTING: { do: 'completeSession', to: 'selecting' },
                CANCELLED: { do: 'cancelSession', to: 'selecting' },
              },
            },
            transformingSelection: {
              onEnter: 'startTransformSession',
              on: {
                MOVED_POINTER: 'updateTransformSession',
                PANNED_CAMERA: 'updateTransformSession',
                PRESSED_SHIFT_KEY: 'keyUpdateTransformSession',
                RELEASED_SHIFT_KEY: 'keyUpdateTransformSession',
                STOPPED_POINTING: { do: 'completeSession', to: 'selecting' },
                CANCELLED: { do: 'cancelSession', to: 'selecting' },
              },
            },
            translatingSelection: {
              onEnter: 'startTranslateSession',
              on: {
                MOVED_POINTER: 'updateTranslateSession',
                PANNED_CAMERA: 'updateTranslateSession',
                PRESSED_SHIFT_KEY: 'keyUpdateTranslateSession',
                RELEASED_SHIFT_KEY: 'keyUpdateTranslateSession',
                PRESSED_ALT_KEY: 'keyUpdateTranslateSession',
                RELEASED_ALT_KEY: 'keyUpdateTranslateSession',
                STOPPED_POINTING: { do: 'completeSession', to: 'selecting' },
                CANCELLED: { do: 'cancelSession', to: 'selecting' },
              },
            },
            translatingHandles: {
              onEnter: 'startHandleSession',
              on: {
                MOVED_POINTER: 'updateHandleSession',
                PANNED_CAMERA: 'updateHandleSession',
                PRESSED_SHIFT_KEY: 'keyUpdateHandleSession',
                RELEASED_SHIFT_KEY: 'keyUpdateHandleSession',
                STOPPED_POINTING: { do: 'completeSession', to: 'selecting' },
                CANCELLED: { do: 'cancelSession', to: 'selecting' },
              },
            },
            brushSelecting: {
              onEnter: [
                {
                  unless: ['isPressingMetaKey', 'isPressingShiftKey'],
                  do: 'clearSelectedIds',
                },
                'clearBoundsRotation',
                'startBrushSession',
              ],
              on: {
                STARTED_PINCHING: { do: 'completeSession', to: 'pinching' },
                // Currently using hacks.fastBrushSelect
                // MOVED_POINTER: 'updateBrushSession',
                PANNED_CAMERA: 'updateBrushSession',
                STOPPED_POINTING: { do: 'completeSession', to: 'selecting' },
                CANCELLED: { do: 'cancelSession', to: 'selecting' },
              },
            },
          },
        },
        pinching: {
          on: {
            // Pinching uses hacks.fastPinchCamera
            // PINCHED: { do: 'pinchCamera' },
          },
          initial: 'selectPinching',
          onExit: { secretlyDo: 'updateZoomCSS' },
          states: {
            selectPinching: {
              on: {
                STOPPED_PINCHING: { to: 'selecting' },
              },
            },
            toolPinching: {
              on: {
                STOPPED_PINCHING: { to: 'usingTool.previous' },
              },
            },
          },
        },
        usingTool: {
          initial: 'draw',
          onEnter: 'clearSelectedIds',
          on: {
            STARTED_PINCHING: {
              do: 'breakSession',
              to: 'pinching.toolPinching',
            },
            TOGGLED_TOOL_LOCK: 'toggleToolLock',
          },
          states: {
            draw: {
              onEnter: 'setActiveToolDraw',
              initial: 'creating',
              states: {
                creating: {
                  on: {
                    CANCELLED: { to: 'selecting' },
                    POINTED_SHAPE: {
                      get: 'newDraw',
                      do: 'createShape',
                      to: 'draw.editing',
                    },
                    POINTED_CANVAS: {
                      get: 'newDraw',
                      do: 'createShape',
                      to: 'draw.editing',
                    },
                    UNDO: { do: 'undo' },
                    REDO: { do: 'redo' },
                  },
                },
                editing: {
                  onEnter: 'startDrawSession',
                  on: {
                    CANCELLED: {
                      do: 'breakSession',
                      to: 'selecting',
                    },
                    STOPPED_POINTING: {
                      do: 'completeSession',
                      to: 'draw.creating',
                    },
                    PRESSED_SHIFT: 'keyUpdateDrawSession',
                    RELEASED_SHIFT: 'keyUpdateDrawSession',
                    // MOVED_POINTER: 'updateDrawSession',
                    PANNED_CAMERA: 'updateDrawSession',
                  },
                },
              },
            },
            dot: {
              onEnter: 'setActiveToolDot',
              initial: 'creating',
              states: {
                creating: {
                  on: {
                    CANCELLED: { to: 'selecting' },
                    POINTED_SHAPE: {
                      get: 'newDot',
                      do: 'createShape',
                      to: 'dot.editing',
                    },
                    POINTED_CANVAS: {
                      get: 'newDot',
                      do: 'createShape',
                      to: 'dot.editing',
                    },
                  },
                },
                editing: {
                  on: {
                    STOPPED_POINTING: [
                      'completeSession',
                      {
                        if: 'isToolLocked',
                        to: 'dot.creating',
                        else: {
                          to: 'selecting',
                        },
                      },
                    ],
                    CANCELLED: {
                      do: 'breakSession',
                      to: 'selecting',
                    },
                  },
                  initial: 'inactive',
                  states: {
                    inactive: {
                      on: {
                        MOVED_POINTER: {
                          if: 'distanceImpliesDrag',
                          to: 'dot.editing.active',
                        },
                      },
                    },
                    active: {
                      onEnter: 'startTranslateSession',
                      on: {
                        MOVED_POINTER: 'updateTranslateSession',
                        PANNED_CAMERA: 'updateTranslateSession',
                      },
                    },
                  },
                },
              },
            },
            arrow: {
              onEnter: 'setActiveToolArrow',
              initial: 'creating',
              states: {
                creating: {
                  on: {
                    CANCELLED: { to: 'selecting' },
                    POINTED_SHAPE: {
                      get: 'newArrow',
                      do: 'createShape',
                      to: 'arrow.editing',
                    },
                    POINTED_CANVAS: {
                      get: 'newArrow',
                      do: 'createShape',
                      to: 'arrow.editing',
                    },
                    UNDO: { do: 'undo' },
                    REDO: { do: 'redo' },
                  },
                },
                editing: {
                  onEnter: 'startArrowSession',
                  on: {
                    STOPPED_POINTING: [
                      'completeSession',
                      {
                        if: 'isToolLocked',
                        to: 'arrow.creating',
                        else: { to: 'selecting' },
                      },
                    ],
                    CANCELLED: {
                      do: 'breakSession',
                      if: 'isToolLocked',
                      to: 'arrow.creating',
                      else: { to: 'selecting' },
                    },
                    PRESSED_SHIFT: 'keyUpdateArrowSession',
                    RELEASED_SHIFT: 'keyUpdateArrowSession',
                    MOVED_POINTER: 'updateArrowSession',
                    PANNED_CAMERA: 'updateArrowSession',
                  },
                },
              },
            },
            circle: {
              onEnter: 'setActiveToolCircle',
              initial: 'creating',
              states: {
                creating: {
                  on: {
                    CANCELLED: { to: 'selecting' },
                    POINTED_SHAPE: {
                      to: 'circle.editing',
                    },
                    POINTED_CANVAS: {
                      to: 'circle.editing',
                    },
                  },
                },
                editing: {
                  on: {
                    STOPPED_POINTING: { to: 'selecting' },
                    CANCELLED: { to: 'selecting' },
                    MOVED_POINTER: {
                      if: 'distanceImpliesDrag',
                      then: {
                        get: 'newCircle',
                        do: 'createShape',
                        to: 'drawingShape.bounds',
                      },
                    },
                  },
                },
              },
            },
            ellipse: {
              onEnter: 'setActiveToolEllipse',
              initial: 'creating',
              states: {
                creating: {
                  on: {
                    CANCELLED: { to: 'selecting' },
                    POINTED_CANVAS: {
                      to: 'ellipse.editing',
                    },
                  },
                },
                editing: {
                  on: {
                    STOPPED_POINTING: { to: 'selecting' },
                    CANCELLED: { to: 'selecting' },
                    MOVED_POINTER: {
                      if: 'distanceImpliesDrag',
                      then: {
                        get: 'newEllipse',
                        do: 'createShape',
                        to: 'drawingShape.bounds',
                      },
                    },
                  },
                },
              },
            },
            rectangle: {
              onEnter: 'setActiveToolRectangle',
              initial: 'creating',
              states: {
                creating: {
                  on: {
                    CANCELLED: { to: 'selecting' },
                    POINTED_SHAPE: {
                      to: 'rectangle.editing',
                    },
                    POINTED_CANVAS: {
                      to: 'rectangle.editing',
                    },
                  },
                },
                editing: {
                  on: {
                    STOPPED_POINTING: { to: 'selecting' },
                    CANCELLED: { to: 'selecting' },
                    MOVED_POINTER: {
                      if: 'distanceImpliesDrag',
                      then: {
                        get: 'newRectangle',
                        do: 'createShape',
                        to: 'drawingShape.bounds',
                      },
                    },
                  },
                },
              },
            },
            ray: {
              onEnter: 'setActiveToolRay',
              initial: 'creating',
              states: {
                creating: {
                  on: {
                    CANCELLED: { to: 'selecting' },
                    POINTED_SHAPE: {
                      get: 'newRay',
                      do: 'createShape',
                      to: 'ray.editing',
                    },
                    POINTED_CANVAS: {
                      get: 'newRay',
                      do: 'createShape',
                      to: 'ray.editing',
                    },
                  },
                },
                editing: {
                  on: {
                    STOPPED_POINTING: { to: 'selecting' },
                    CANCELLED: { to: 'selecting' },
                    MOVED_POINTER: {
                      if: 'distanceImpliesDrag',
                      to: 'drawingShape.direction',
                    },
                  },
                },
              },
            },
            line: {
              onEnter: 'setActiveToolLine',
              initial: 'creating',
              states: {
                creating: {
                  on: {
                    CANCELLED: { to: 'selecting' },
                    POINTED_SHAPE: {
                      get: 'newLine',
                      do: 'createShape',
                      to: 'line.editing',
                    },
                    POINTED_CANVAS: {
                      get: 'newLine',
                      do: 'createShape',
                      to: 'line.editing',
                    },
                  },
                },
                editing: {
                  on: {
                    STOPPED_POINTING: { to: 'selecting' },
                    CANCELLED: { to: 'selecting' },
                    MOVED_POINTER: {
                      if: 'distanceImpliesDrag',
                      to: 'drawingShape.direction',
                    },
                  },
                },
              },
            },
            polyline: {
              onEnter: 'setActiveToolPolyline',
            },
          },
        },
        drawingShape: {
          on: {
            STOPPED_POINTING: [
              'completeSession',
              {
                if: 'isToolLocked',
                to: 'usingTool.previous',
                else: { to: 'selecting' },
              },
            ],
            CANCELLED: {
              do: 'breakSession',
              to: 'selecting',
            },
          },
          initial: 'drawingShapeBounds',
          states: {
            bounds: {
              onEnter: 'startDrawTransformSession',
              on: {
                MOVED_POINTER: 'updateTransformSession',
                PANNED_CAMERA: 'updateTransformSession',
              },
            },
            direction: {
              onEnter: 'startDirectionSession',
              on: {
                MOVED_POINTER: 'updateDirectionSession',
                PANNED_CAMERA: 'updateDirectionSession',
              },
            },
          },
        },
      },
    },
  },
  results: {
    newArrow() {
      return ShapeType.Arrow
    },
    newDraw() {
      return ShapeType.Draw
    },
    newDot() {
      return ShapeType.Dot
    },
    newRay() {
      return ShapeType.Ray
    },
    newLine() {
      return ShapeType.Line
    },
    newCircle() {
      return ShapeType.Circle
    },
    newEllipse() {
      return ShapeType.Ellipse
    },
    newRectangle() {
      return ShapeType.Rectangle
    },
  },
  conditions: {
    isPointingBounds(data, payload: PointerInfo) {
      return payload.target === 'bounds'
    },
    isReadOnly(data) {
      return data.isReadOnly
    },
    distanceImpliesDrag(data, payload: PointerInfo) {
      return vec.dist2(payload.origin, payload.point) > 8
    },
    isPointedShapeSelected(data) {
      return data.selectedIds.has(data.pointedId)
    },
    isPressingShiftKey(data, payload: PointerInfo) {
      return payload.shiftKey
    },
    isPressingMetaKey(data, payload: PointerInfo) {
      return payload.metaKey
    },
    shapeIsHovered(data, payload: { target: string }) {
      return data.hoveredId === payload.target
    },
    pointHitsShape(data, payload: { target: string; point: number[] }) {
      const shape = getShape(data, payload.target)

      return getShapeUtils(shape).hitTest(
        shape,
        screenToWorld(payload.point, data)
      )
    },
    isPointingRotationHandle(
      data,
      payload: { target: Edge | Corner | 'rotate' }
    ) {
      return payload.target === 'rotate'
    },
    hasSelection(data) {
      return data.selectedIds.size > 0
    },
    hasMultipleSelection(data) {
      return data.selectedIds.size > 1
    },
    isToolLocked(data) {
      return data.settings.isToolLocked
    },
    isPenLocked(data) {
      return data.settings.isPenLocked
    },
    hasOnlyOnePage(data) {
      return Object.keys(data.document.pages).length === 1
    },
    selectionIncludesGroups(data) {
      return getSelectedShapes(data).some(
        (shape) => shape.type === ShapeType.Group
      )
    },
  },
  actions: {
    /* ---------------------- Pages --------------------- */
    setCurrentPage(data, payload: { id: string }) {
      commands.changePage(data, payload.id)
    },
    createPage(data) {
      commands.createPage(data)
    },
    deletePage(data, payload: { id: string }) {
      commands.deletePage(data, payload.id)
    },

    /* --------------------- Shapes --------------------- */
    createShape(data, payload, type: ShapeType) {
      const shape = createShape(type, {
        parentId: data.currentPageId,
        point: screenToWorld(payload.point, data),
        style: getCurrent(data.currentStyle),
      })

      const siblings = getChildren(data, shape.parentId)
      const childIndex = siblings.length
        ? siblings[siblings.length - 1].childIndex + 1
        : 1

      getShapeUtils(shape).setProperty(shape, 'childIndex', childIndex)

      getPage(data).shapes[shape.id] = shape

      data.selectedIds.clear()
      data.selectedIds.add(shape.id)
    },
    /* -------------------- Sessions -------------------- */

    // Shared
    breakSession(data) {
      session.current?.cancel(data)
      session.clear()
      history.disable()
      commands.deleteSelected(data)
      history.enable()
    },
    cancelSession(data) {
      session.current?.cancel(data)
      session.clear()
    },
    completeSession(data) {
      session.current?.complete(data)
      session.clear()
    },

    // Brushing
    startBrushSession(data, payload: PointerInfo) {
      session.current = new Sessions.BrushSession(
        data,
        screenToWorld(payload.point, data)
      )
    },
    updateBrushSession(data, payload: PointerInfo) {
      session.current.update(data, screenToWorld(payload.point, data))
    },

    // Rotating
    startRotateSession(data, payload: PointerInfo) {
      session.current = new Sessions.RotateSession(
        data,
        screenToWorld(payload.point, data)
      )
    },
    keyUpdateRotateSession(data, payload: PointerInfo) {
      session.current.update(
        data,
        screenToWorld(inputs.pointer.point, data),
        payload.shiftKey
      )
    },
    updateRotateSession(data, payload: PointerInfo) {
      session.current.update(
        data,
        screenToWorld(payload.point, data),
        payload.shiftKey
      )
    },

    // Dragging / Translating
    startTranslateSession(data) {
      session.current = new Sessions.TranslateSession(
        data,
        screenToWorld(inputs.pointer.origin, data)
      )
    },
    keyUpdateTranslateSession(
      data,
      payload: { shiftKey: boolean; altKey: boolean }
    ) {
      session.current.update(
        data,
        screenToWorld(inputs.pointer.point, data),
        payload.shiftKey,
        payload.altKey
      )
    },
    updateTranslateSession(data, payload: PointerInfo) {
      session.current.update(
        data,
        screenToWorld(payload.point, data),
        payload.shiftKey,
        payload.altKey
      )
    },

    // Dragging Handle
    startHandleSession(data, payload: PointerInfo) {
      const shapeId = Array.from(data.selectedIds.values())[0]
      const handleId = payload.target

      session.current = new Sessions.HandleSession(
        data,
        shapeId,
        handleId,
        screenToWorld(inputs.pointer.origin, data)
      )
    },
    keyUpdateHandleSession(
      data,
      payload: { shiftKey: boolean; altKey: boolean }
    ) {
      session.current.update(
        data,
        screenToWorld(inputs.pointer.point, data),
        payload.shiftKey,
        payload.altKey
      )
    },
    updateHandleSession(data, payload: PointerInfo) {
      session.current.update(
        data,
        screenToWorld(payload.point, data),
        payload.shiftKey,
        payload.altKey
      )
    },

    // Transforming
    startTransformSession(
      data,
      payload: PointerInfo & { target: Corner | Edge }
    ) {
      const point = screenToWorld(inputs.pointer.origin, data)
      session.current =
        data.selectedIds.size === 1
          ? new Sessions.TransformSingleSession(data, payload.target, point)
          : new Sessions.TransformSession(data, payload.target, point)
    },
    startDrawTransformSession(data, payload: PointerInfo) {
      session.current = new Sessions.TransformSingleSession(
        data,
        Corner.BottomRight,
        screenToWorld(payload.point, data),
        true
      )
    },
    keyUpdateTransformSession(data, payload: PointerInfo) {
      session.current.update(
        data,
        screenToWorld(inputs.pointer.point, data),
        payload.shiftKey,
        payload.altKey
      )
    },
    updateTransformSession(data, payload: PointerInfo) {
      session.current.update(
        data,
        screenToWorld(payload.point, data),
        payload.shiftKey,
        payload.altKey
      )
    },

    // Direction
    startDirectionSession(data, payload: PointerInfo) {
      session.current = new Sessions.DirectionSession(
        data,
        screenToWorld(inputs.pointer.origin, data)
      )
    },
    updateDirectionSession(data, payload: PointerInfo) {
      session.current.update(data, screenToWorld(payload.point, data))
    },

    // Drawing
    startDrawSession(data, payload: PointerInfo) {
      const id = Array.from(data.selectedIds.values())[0]
      session.current = new Sessions.DrawSession(
        data,
        id,
        screenToWorld(inputs.pointer.origin, data),
        payload.shiftKey
      )
    },
    keyUpdateDrawSession(data, payload: PointerInfo) {
      session.current.update(
        data,
        screenToWorld(inputs.pointer.point, data),
        payload.pressure,
        payload.shiftKey
      )
    },
    updateDrawSession(data, payload: PointerInfo) {
      session.current.update(
        data,
        screenToWorld(payload.point, data),
        payload.pressure,
        payload.shiftKey
      )
    },

    // Arrow
    startArrowSession(data, payload: PointerInfo) {
      const id = Array.from(data.selectedIds.values())[0]
      session.current = new Sessions.ArrowSession(
        data,
        id,
        screenToWorld(inputs.pointer.origin, data),
        payload.shiftKey
      )
    },
    keyUpdateArrowSession(data, payload: PointerInfo) {
      session.current.update(
        data,
        screenToWorld(inputs.pointer.point, data),
        payload.shiftKey
      )
    },
    updateArrowSession(data, payload: PointerInfo) {
      session.current.update(
        data,
        screenToWorld(payload.point, data),
        payload.shiftKey
      )
    },

    // Nudges
    nudgeSelection(data, payload: { delta: number[]; shiftKey: boolean }) {
      commands.nudge(
        data,
        vec.mul(
          payload.delta,
          payload.shiftKey
            ? data.settings.nudgeDistanceLarge
            : data.settings.nudgeDistanceSmall
        )
      )
    },

    /* -------------------- Selection ------------------- */

    selectAll(data) {
      const { selectedIds } = data
      const page = getPage(data)
      selectedIds.clear()
      for (let id in page.shapes) {
        if (page.shapes[id].parentId === data.currentPageId) {
          selectedIds.add(id)
        }
      }
    },
    setHoveredId(data, payload: PointerInfo) {
      data.hoveredId = payload.target
    },
    clearHoveredId(data) {
      data.hoveredId = undefined
    },
    setPointedId(data, payload: PointerInfo) {
      data.pointedId = getPointedId(data, payload.target)
      data.currentParentId = getParentId(data, data.pointedId)
    },
    setDrilledPointedId(data, payload: PointerInfo) {
      data.pointedId = getDrilledPointedId(data, payload.target)
      data.currentParentId = getParentId(data, data.pointedId)
    },
    clearCurrentParentId(data) {
      data.currentParentId = data.currentPageId
      data.pointedId = undefined
    },
    clearPointedId(data) {
      data.pointedId = undefined
    },
    clearSelectedIds(data) {
      data.selectedIds.clear()
    },
    pullPointedIdFromSelectedIds(data) {
      const { selectedIds, pointedId } = data
      selectedIds.delete(pointedId)
    },
    pushPointedIdToSelectedIds(data) {
      data.selectedIds.add(data.pointedId)
    },
    moveSelection(data, payload: { type: MoveType }) {
      commands.move(data, payload.type)
    },
    alignSelection(data, payload: { type: AlignType }) {
      commands.align(data, payload.type)
    },
    stretchSelection(data, payload: { type: StretchType }) {
      commands.stretch(data, payload.type)
    },
    distributeSelection(data, payload: { type: DistributeType }) {
      commands.distribute(data, payload.type)
    },
    duplicateSelection(data) {
      commands.duplicate(data)
    },
    lockSelection(data) {
      commands.toggle(data, 'isLocked')
    },
    hideSelection(data) {
      commands.toggle(data, 'isHidden')
    },
    aspectLockSelection(data) {
      commands.toggle(data, 'isAspectRatioLocked')
    },
    deleteSelection(data) {
      commands.deleteSelected(data)
    },
    rotateSelectionCcw(data) {
      commands.rotateCcw(data)
    },
    groupSelection(data) {
      commands.group(data)
    },
    ungroupSelection(data) {
      commands.ungroup(data)
    },

    /* ---------------------- Tool ---------------------- */

    setActiveTool(data, payload: { tool: ShapeType | 'select' }) {
      data.activeTool = payload.tool
    },
    setActiveToolSelect(data) {
      data.activeTool = 'select'
    },
    setActiveToolDraw(data) {
      data.activeTool = ShapeType.Draw
    },
    setActiveToolRectangle(data) {
      data.activeTool = ShapeType.Rectangle
    },
    setActiveToolEllipse(data) {
      data.activeTool = ShapeType.Ellipse
    },
    setActiveToolArrow(data) {
      data.activeTool = ShapeType.Arrow
    },
    setActiveToolDot(data) {
      data.activeTool = ShapeType.Dot
    },
    setActiveToolPolyline(data) {
      data.activeTool = ShapeType.Polyline
    },
    setActiveToolRay(data) {
      data.activeTool = ShapeType.Ray
    },
    setActiveToolCircle(data) {
      data.activeTool = ShapeType.Circle
    },
    setActiveToolLine(data) {
      data.activeTool = ShapeType.Line
    },

    /* --------------------- Camera --------------------- */

    zoomIn(data) {
      const camera = getCurrentCamera(data)
      const i = Math.round((camera.zoom * 100) / 25)
      const center = [window.innerWidth / 2, window.innerHeight / 2]

      const p0 = screenToWorld(center, data)
      camera.zoom = getCameraZoom((i + 1) * 0.25)
      const p1 = screenToWorld(center, data)
      camera.point = vec.add(camera.point, vec.sub(p1, p0))

      setZoomCSS(camera.zoom)
    },
    zoomOut(data) {
      const camera = getCurrentCamera(data)
      const i = Math.round((camera.zoom * 100) / 25)
      const center = [window.innerWidth / 2, window.innerHeight / 2]

      const p0 = screenToWorld(center, data)
      camera.zoom = getCameraZoom((i - 1) * 0.25)
      const p1 = screenToWorld(center, data)
      camera.point = vec.add(camera.point, vec.sub(p1, p0))

      setZoomCSS(camera.zoom)
    },
    zoomCameraToActual(data) {
      const camera = getCurrentCamera(data)
      const center = [window.innerWidth / 2, window.innerHeight / 2]

      const p0 = screenToWorld(center, data)
      camera.zoom = 1
      const p1 = screenToWorld(center, data)
      camera.point = vec.add(camera.point, vec.sub(p1, p0))

      setZoomCSS(camera.zoom)
    },
    zoomCameraToSelectionActual(data) {
      const camera = getCurrentCamera(data)

      const bounds = getSelectedBounds(data)

      const mx = (window.innerWidth - bounds.width) / 2
      const my = (window.innerHeight - bounds.height) / 2

      camera.zoom = 1
      camera.point = vec.add([-bounds.minX, -bounds.minY], [mx, my])

      setZoomCSS(camera.zoom)
    },
    zoomCameraToSelection(data) {
      const camera = getCurrentCamera(data)
      const bounds = getSelectedBounds(data)

      const zoom = getCameraZoom(
        bounds.width > bounds.height
          ? (window.innerWidth - 128) / bounds.width
          : (window.innerHeight - 128) / bounds.height
      )

      const mx = (window.innerWidth - bounds.width * zoom) / 2 / zoom
      const my = (window.innerHeight - bounds.height * zoom) / 2 / zoom

      camera.zoom = zoom
      camera.point = vec.add([-bounds.minX, -bounds.minY], [mx, my])

      setZoomCSS(camera.zoom)
    },
    zoomCameraToFit(data) {
      const camera = getCurrentCamera(data)
      const page = getPage(data)

      const shapes = Object.values(page.shapes)

      if (shapes.length === 0) {
        return
      }

      const bounds = getCommonBounds(
        ...Object.values(shapes).map((shape) =>
          getShapeUtils(shape).getBounds(shape)
        )
      )

      const zoom = getCameraZoom(
        bounds.width > bounds.height
          ? (window.innerWidth - 128) / bounds.width
          : (window.innerHeight - 128) / bounds.height
      )

      const mx = (window.innerWidth - bounds.width * zoom) / 2 / zoom
      const my = (window.innerHeight - bounds.height * zoom) / 2 / zoom

      camera.zoom = zoom
      camera.point = vec.add([-bounds.minX, -bounds.minY], [mx, my])

      setZoomCSS(camera.zoom)
    },
    zoomCamera(data, payload: { delta: number; point: number[] }) {
      const camera = getCurrentCamera(data)
      const next = camera.zoom - (payload.delta / 100) * camera.zoom

      const p0 = screenToWorld(payload.point, data)
      camera.zoom = getCameraZoom(next)
      const p1 = screenToWorld(payload.point, data)
      camera.point = vec.add(camera.point, vec.sub(p1, p0))

      setZoomCSS(camera.zoom)
    },
    panCamera(data, payload: { delta: number[] }) {
      const camera = getCurrentCamera(data)
      camera.point = vec.sub(camera.point, vec.div(payload.delta, camera.zoom))
    },
    updateZoomCSS(data) {
      const camera = getCurrentCamera(data)
      setZoomCSS(camera.zoom)
    },
    pinchCamera(
      data,
      payload: {
        delta: number[]
        distanceDelta: number
        angleDelta: number
        point: number[]
      }
    ) {
      const camera = getCurrentCamera(data)
      camera.point = vec.sub(camera.point, vec.div(payload.delta, camera.zoom))

      const next = camera.zoom - (payload.distanceDelta / 300) * camera.zoom

      const p0 = screenToWorld(payload.point, data)
      camera.zoom = getCameraZoom(next)
      const p1 = screenToWorld(payload.point, data)
      camera.point = vec.add(camera.point, vec.sub(p1, p0))

      setZoomCSS(camera.zoom)
    },
    resetCamera(data) {
      const camera = getCurrentCamera(data)
      camera.zoom = 1
      camera.point = [window.innerWidth / 2, window.innerHeight / 2]
      document.documentElement.style.setProperty('--camera-zoom', '1')
    },

    /* ---------------------- History ---------------------- */

    // History
    popHistory() {
      history.pop()
    },
    forceSave(data) {
      history.save(data)
    },
    enableHistory() {
      history.enable()
    },
    disableHistory() {
      history.disable()
    },
    undo(data) {
      history.undo(data)
    },
    redo(data) {
      history.redo(data)
    },

    /* --------------------- Styles --------------------- */

    toggleStylePanel(data) {
      data.settings.isStyleOpen = !data.settings.isStyleOpen
    },
    closeStylePanel(data) {
      data.settings.isStyleOpen = false
    },
    updateStyles(data, payload: Partial<ShapeStyles>) {
      Object.assign(data.currentStyle, payload)
    },
    applyStylesToSelection(data, payload: Partial<ShapeStyles>) {
      commands.style(data, payload)
    },

    /* ---------------------- Code ---------------------- */

    closeCodePanel(data) {
      data.settings.isCodeOpen = false
    },
    openCodePanel(data) {
      data.settings.isCodeOpen = true
    },
    toggleCodePanel(data) {
      data.settings.isCodeOpen = !data.settings.isCodeOpen
    },
    setGeneratedShapes(
      data,
      payload: { shapes: Shape[]; controls: CodeControl[] }
    ) {
      commands.generate(data, data.currentPageId, payload.shapes)
    },
    setCodeControls(data, payload: { controls: CodeControl[] }) {
      data.codeControls = Object.fromEntries(
        payload.controls.map((control) => [control.id, control])
      )
    },
    increaseCodeFontSize(data) {
      data.settings.fontSize++
    },
    decreaseCodeFontSize(data) {
      data.settings.fontSize--
    },
    updateControls(data, payload: { [key: string]: any }) {
      for (let key in payload) {
        data.codeControls[key].value = payload[key]
      }

      history.disable()

      data.selectedIds.clear()

      try {
        const { shapes } = updateFromCode(
          data.document.code[data.currentCodeFileId].code,
          data.codeControls
        )

        commands.generate(data, data.currentPageId, shapes)
      } catch (e) {
        console.error(e)
      }

      history.enable()
    },

    /* -------------------- Settings -------------------- */

    enablePenLock(data) {
      data.settings.isPenLocked = true
    },
    disablePenLock(data) {
      data.settings.isPenLocked = false
    },
    toggleToolLock(data) {
      data.settings.isToolLocked = !data.settings.isToolLocked
    },

    /* ---------------------- Data ---------------------- */

    saveCode(data, payload: { code: string }) {
      data.document.code[data.currentCodeFileId].code = payload.code
      history.save(data)
    },

    restoreSavedData(data) {
      history.load(data)
    },

    clearBoundsRotation(data) {
      data.boundsRotation = 0
    },
  },
  values: {
    selectedIds(data) {
      return new Set(data.selectedIds)
    },
    selectedBounds(data) {
      const { selectedIds } = data

      const page = getPage(data)

      const shapes = Array.from(selectedIds.values())
        .map((id) => page.shapes[id])
        .filter(Boolean)

      if (selectedIds.size === 0) return null

      if (selectedIds.size === 1) {
        if (!shapes[0]) {
          console.error('Could not find that shape! Clearing selected IDs.')
          data.selectedIds.clear()
          return null
        }

        const shape = shapes[0]
        const shapeUtils = getShapeUtils(shape)

        if (!shapeUtils.canTransform) return null

        let bounds = shapeUtils.getBounds(shape)

        let parentId = shape.parentId

        while (parentId !== data.currentPageId) {
          const parent = page.shapes[parentId]

          bounds = rotateBounds(
            bounds,
            getBoundsCenter(getShapeUtils(parent).getBounds(parent)),
            parent.rotation
          )

          bounds.rotation = parent.rotation

          parentId = parent.parentId
        }

        return bounds
      }

      const uniqueSelectedShapeIds: string[] = Array.from(
        new Set(
          Array.from(selectedIds.values()).flatMap((id) =>
            getDocumentBranch(data, id)
          )
        ).values()
      )

      const commonBounds = getCommonBounds(
        ...uniqueSelectedShapeIds
          .map((id) => page.shapes[id])
          .filter((shape) => shape.type !== ShapeType.Group)
          .map((shape) => {
            const parentOffset = getParentOffset(data, shape.id)
            const parentRotation = getParentRotation(data, shape.id)
            const bounds = getShapeUtils(shape).getRotatedBounds(shape)

            return bounds

            return translateBounds(
              rotateBounds(bounds, getBoundsCenter(bounds), parentRotation),
              vec.neg(parentOffset)
            )
          })
      )

      return commonBounds
    },
    selectedStyle(data) {
      const selectedIds = Array.from(data.selectedIds.values())
      const { currentStyle } = data

      if (selectedIds.length === 0) {
        return currentStyle
      }
      const page = getPage(data)

      const shapeStyles = selectedIds.map((id) => page.shapes[id].style)

      const commonStyle: ShapeStyles = {} as ShapeStyles

      const overrides = new Set<string>([])

      for (const shapeStyle of shapeStyles) {
        for (let key in currentStyle) {
          if (overrides.has(key)) continue
          if (commonStyle[key] === undefined) {
            commonStyle[key] = shapeStyle[key]
          } else {
            if (commonStyle[key] === shapeStyle[key]) continue
            commonStyle[key] = currentStyle[key]
            overrides.add(key)
          }
        }
      }

      return commonStyle
    },
  },
})

export default state

export const useSelector = createSelectorHook(state)

function getParentId(data: Data, id: string) {
  const shape = getPage(data).shapes[id]
  return shape.parentId
}

function getPointedId(data: Data, id: string) {
  const shape = getPage(data).shapes[id]

  return shape.parentId === data.currentParentId ||
    shape.parentId === data.currentPageId
    ? id
    : getPointedId(data, shape.parentId)
}

function getDrilledPointedId(data: Data, id: string) {
  const shape = getPage(data).shapes[id]
  return shape.parentId === data.currentPageId ||
    shape.parentId === data.pointedId ||
    shape.parentId === data.currentParentId
    ? id
    : getDrilledPointedId(data, shape.parentId)
}

function hasPointedIdInChildren(data: Data, id: string, pointedId: string) {
  const shape = getPage(data).shapes[id]

  if (shape.type !== ShapeType.Group) {
    return false
  }

  if (shape.children.includes(pointedId)) {
    return true
  }

  return shape.children.some((childId) =>
    hasPointedIdInChildren(data, childId, pointedId)
  )
}
