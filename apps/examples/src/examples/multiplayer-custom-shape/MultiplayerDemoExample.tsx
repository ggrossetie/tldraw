import { useMultiplayerDemo } from '@tldraw/sync'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import { CounterShapeTool, CounterShapeUtil } from './CounterShape'
import { components, uiOverrides } from './ui'

const customShapes = [CounterShapeUtil]
const customTools = [CounterShapeTool]

export default function MultiplayerCustomShapeExample({ roomId }: { roomId: string }) {
	const store = useMultiplayerDemo({ roomId, shapeUtils: customShapes })
	return (
		<div className="tldraw__editor">
			<Tldraw
				store={store}
				shapeUtils={customShapes}
				tools={customTools}
				overrides={uiOverrides}
				components={components}
			/>
		</div>
	)
}
