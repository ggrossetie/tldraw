import { Vec } from '@tldraw/editor'
import { TestEditor } from '../TestEditor'

let editor: TestEditor

beforeEach(() => {
	editor = new TestEditor()
})

it('ignores touch events while in pen mode', async () => {
	editor.setCurrentTool('draw')
	editor.instanceState.update({ isPenMode: true })
	editor.dispatch({
		type: 'pointer',
		name: 'pointer_down',
		isPen: false,
		pointerId: 1,
		point: new Vec(100, 100),
		shiftKey: false,
		altKey: false,
		ctrlKey: false,
		button: 1,
		target: 'canvas',
	})

	expect(editor.getCurrentPageShapes().length).toBe(0)
})
