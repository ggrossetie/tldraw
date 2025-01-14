import { TL_CONTAINER_CLASS } from '../../TldrawEditor'
import { getDefaultCdnBaseUrl } from '../../utils/assets'
import { Editor } from '../Editor'
import { LicenseFromKeyResult } from './LicenseManager'
import { watermarkDesktopSvg, watermarkMobileSvg } from './watermarks'

export const WATERMARK_DESKTOP_FILENAME = 'watermark-desktop.svg'
export const WATERMARK_MOBILE_FILENAME = 'watermark-mobile.svg'
export const WATERMARKS_FOLDER = 'watermarks'

export class WatermarkManager {
	constructor(private editor: Editor) {}

	private forceLocal = false

	private setWatermarkSrc(watermark: HTMLImageElement) {
		const isMobile = window.innerWidth < 840 /* PORTRAIT_BREAKPOINTS[TABLET] */

		const width = isMobile ? '32px' : '120px'
		let src = ''
		if (navigator.onLine && !this.forceLocal) {
			src = `${getDefaultCdnBaseUrl()}/${WATERMARKS_FOLDER}/${isMobile ? WATERMARK_MOBILE_FILENAME : WATERMARK_DESKTOP_FILENAME}`
		} else {
			src = `data:image/svg+xml;utf8,${isMobile ? watermarkMobileSvg : watermarkDesktopSvg}`
		}

		if (src !== watermark.src) {
			watermark.style.width = width
			watermark.src = src
		}
	}

	private createWatermark(doReplace = false) {
		let watermark = this.findWatermark()

		if (watermark && !doReplace) return watermark

		if (!watermark) {
			watermark = document.createElement('img')
		}

		this.applyStyles(watermark)

		const canvas = this.getWatermarkParent()
		if (canvas) canvas.appendChild(watermark)

		return watermark
	}

	private getWatermarkParent() {
		return document.getElementsByClassName(TL_CONTAINER_CLASS)[0] as HTMLElement
	}

	private shouldShowWatermark(license: LicenseFromKeyResult) {
		if (!license.isLicenseParseable) return true
		if (!license.isDomainValid && !license.isDevelopment) return true

		if (license.isPerpetualLicenseExpired || license.isAnnualLicenseExpired) {
			if (license.isInternalLicense) {
				throw new Error('License: Internal license expired.')
			}
			return true
		}

		return false
	}

	private findWatermark() {
		const canvas = this.getWatermarkParent()
		if (!canvas) return
		const children = [...canvas.children]

		return children.find(
			(element) =>
				element instanceof HTMLImageElement &&
				(element.src.includes(WATERMARK_DESKTOP_FILENAME) ||
					element.src.includes(WATERMARK_MOBILE_FILENAME))
		) as HTMLImageElement
	}

	checkWatermark(license: LicenseFromKeyResult) {
		if (!this.shouldShowWatermark(license)) return false

		this.createWatermark()

		const resizeListener = () => {
			// We need to replace the watermark to ensure the correct size is shown.
			const watermark = this.createWatermark(true /* doReplace */)
			watermark && this.setWatermarkSrc(watermark)
		}
		window.addEventListener('resize', resizeListener)

		this.editor.timers.setTimeout(() => {
			// Ensure the watermark is still there.
			// We check this once for any naughtiness.
			// Don't be naughty.
			const watermark = this.createWatermark()

			this.applyStyles(watermark)
		}, 5000)

		return true
	}

	applyStyles(watermark: HTMLImageElement) {
		watermark.style.setProperty('position', 'absolute', 'important')
		watermark.style.setProperty('bottom', '8px', 'important')
		watermark.style.setProperty('right', '8px', 'important')
		watermark.style.setProperty('opacity', '1', 'important')
		watermark.style.setProperty('z-index', '2147483647' /* max */, 'important')
		watermark.style.setProperty('pointer-events', 'all', 'important')
		watermark.style.setProperty('cursor', 'pointer', 'important')
		watermark.setAttribute('target', '_blank')
		watermark.onerror = () => {
			// In case we're online but it's blocking this specific request,
			// we still fallback to the local watermark.
			this.forceLocal = true
			this.setWatermarkSrc(watermark)
			watermark.onerror = null
		}
		watermark.onclick = () => {
			window.open('https://tldraw.dev', '_blank', 'noopener noreferrer')
		}
		this.setWatermarkSrc(watermark)
	}
}
