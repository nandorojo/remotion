import type {Codec, StillImageFormat} from '@remotion/renderer';
import {BrowserSafeApis} from '@remotion/renderer/client';
import type {ChangeEvent} from 'react';
import React, {
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from 'react';
import {Internals} from 'remotion';
import type {TComposition} from 'remotion/src/internals';
import {Button} from '../../../preview-server/error-overlay/remotion-overlay/Button';
import {useFileExistence} from '../../helpers/use-file-existence';
import {ModalsContext} from '../../state/modals';
import {Checkbox} from '../Checkbox';
import {CollapsableOptions} from '../CollapsableOptions';
import {Spacing} from '../layout';
import {ModalContainer} from '../ModalContainer';
import {NewCompHeader} from '../ModalHeader';
import {InputDragger} from '../NewComposition/InputDragger';
import {RemotionInput, RightAlignInput} from '../NewComposition/RemInput';
import {ValidationMessage} from '../NewComposition/ValidationMessage';
import {addStillRenderJob, addVideoRenderJob} from '../RenderQueue/actions';
import type {SegmentedControlItem} from '../SegmentedControl';
import {SegmentedControl} from '../SegmentedControl';
import {leftSidebarTabs} from '../SidebarContent';
import {CrfSetting, useCrfState} from './CrfSetting';
import {FrameRangeSetting} from './FrameRangeSetting';
import {label, optionRow, rightRow} from './layout';
import {QualitySetting} from './QualitySetting';
import {ScaleSetting} from './ScaleSetting';

type State =
	| {
			type: 'idle';
	  }
	| {
			type: 'success';
	  }
	| {
			type: 'load';
	  }
	| {
			type: 'error';
	  };

const initialState: State = {type: 'idle'};

export type RenderType = 'still' | 'video' | 'audio';

type Action =
	| {
			type: 'start';
	  }
	| {
			type: 'succeed';
	  }
	| {
			type: 'fail';
	  };

const reducer = (state: State, action: Action): State => {
	if (action.type === 'start') {
		return {
			type: 'load',
		};
	}

	if (action.type === 'fail') {
		return {
			type: 'error',
		};
	}

	if (action.type === 'succeed') {
		return {
			type: 'success',
		};
	}

	return state;
};

const container: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'row',
	alignItems: 'center',
	padding: '12px 16px',
	width: '100%',
	borderBottom: '1px solid black',
};

const buttonRow: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'row',
	justifyContent: 'flex-end',
	borderTop: '1px solid black',
	paddingTop: 8,
	paddingBottom: 8,
	paddingLeft: 16,
	paddingRight: 16,
};

const input: React.CSSProperties = {
	minWidth: 250,
	textAlign: 'right',
};

export const RenderModal: React.FC<{
	compositionId: string;
	initialFrame: number;
	initialVideoImageFormat: StillImageFormat;
	initialStillImageFormat: StillImageFormat;
	initialQuality: number | null;
	initialScale: number;
	initialVerbose: boolean;
	initialOutName: string;
	initialRenderType: RenderType;
	initialAudioCodec: Codec;
	initialVideoCodec: Codec;
	initialConcurrency: number;
	minConcurrency: number;
	maxConcurrency: number;
}> = ({
	compositionId,
	initialFrame,
	initialVideoImageFormat,
	initialStillImageFormat,
	initialQuality,
	initialScale,
	initialVerbose,
	initialOutName,
	initialRenderType,
	initialAudioCodec,
	initialVideoCodec,
	initialConcurrency,
	maxConcurrency,
	minConcurrency,
}) => {
	const {setSelectedModal} = useContext(ModalsContext);

	const onQuit = useCallback(() => {
		setSelectedModal(null);
	}, [setSelectedModal]);

	const isMounted = useRef(true);

	const [state, dispatch] = useReducer(reducer, initialState);
	const [unclampedFrame, setFrame] = useState(() => initialFrame);

	const [stillImageFormat, setStillImageFormat] = useState<StillImageFormat>(
		() => initialStillImageFormat
	);
	const [videoImageFormat, setVideoImageFormat] = useState<StillImageFormat>(
		() => initialVideoImageFormat
	);
	const [concurrency, setConcurrency] = useState(() => initialConcurrency);
	const [videoCodec, setVideoSpecificalCodec] = useState<Codec>(
		() => initialVideoCodec
	);
	const [audioCodec, setAudioSpecificalCodec] = useState<Codec>(
		() => initialAudioCodec
	);

	const [renderMode, setRenderModeState] =
		useState<RenderType>(initialRenderType);
	const [quality, setQuality] = useState<number>(() => initialQuality ?? 80);
	const [scale, setScale] = useState(() => initialScale);
	const [verbose, setVerboseLogging] = useState(() => initialVerbose);
	const [outName, setOutName] = useState(() => initialOutName);
	const [endFrameOrNull, setEndFrame] = useState<number | null>(() => null);
	const [startFrameOrNull, setStartFrame] = useState<number | null>(() => null);

	const codec = useMemo(() => {
		if (renderMode === 'audio') {
			return audioCodec;
		}

		return videoCodec;
	}, [audioCodec, renderMode, videoCodec]);
	const {crf, maxCrf, minCrf, setCrf, shouldDisplayOption} = useCrfState(codec);

	const dispatchIfMounted: typeof dispatch = useCallback((payload) => {
		if (isMounted.current === false) return;
		dispatch(payload);
	}, []);

	const onValueChange: React.ChangeEventHandler<HTMLInputElement> = useCallback(
		(e) => {
			setOutName(e.target.value);
		},
		[]
	);

	const {compositions} = useContext(Internals.CompositionManager);

	const currentComposition = useMemo((): TComposition | null => {
		for (const composition of compositions) {
			if (composition.id === compositionId) {
				return composition;
			}
		}

		return null;
	}, [compositionId, compositions]);

	if (currentComposition === null) {
		throw new Error('This composition does not exist');
	}

	const endFrame = useMemo((): number => {
		if (endFrameOrNull === null) {
			return currentComposition.durationInFrames - 1;
		}

		return Math.max(
			0,
			Math.min(currentComposition.durationInFrames - 1, endFrameOrNull)
		);
	}, [currentComposition.durationInFrames, endFrameOrNull]);

	const startFrame = useMemo((): number => {
		if (startFrameOrNull === null) {
			return 0;
		}

		return Math.max(0, Math.min(endFrame - 1, startFrameOrNull));
	}, [endFrame, startFrameOrNull]);

	const frame = useMemo(() => {
		const parsed = Math.floor(unclampedFrame);

		return Math.max(
			0,
			Math.min(currentComposition.durationInFrames - 1, parsed)
		);
	}, [currentComposition.durationInFrames, unclampedFrame]);

	const getStringBeforeSuffix = useCallback((fileName: string) => {
		const dotPos = fileName.lastIndexOf('.');
		const bitBeforeDot = fileName.substring(0, dotPos);
		return bitBeforeDot;
	}, []);

	const setDefaultOutName = useCallback(
		(
			options:
				| {type: 'still'; imageFormat: StillImageFormat}
				| {
						type: 'render';
						codec: Codec;
				  }
		) => {
			if (options.type === 'still') {
				setOutName((prev) => {
					const newFileName =
						getStringBeforeSuffix(prev) + '.' + options.imageFormat;
					return newFileName;
				});
			} else {
				setOutName((prev) => {
					const codecSuffix = BrowserSafeApis.getFileExtensionFromCodec(
						options.codec
					);
					const newFileName = getStringBeforeSuffix(prev) + '.' + codecSuffix;
					return newFileName;
				});
			}
		},
		[getStringBeforeSuffix]
	);

	const setCodec = useCallback(
		(newCodec: Codec) => {
			if (renderMode === 'audio') {
				setAudioSpecificalCodec(newCodec);
			} else {
				setVideoSpecificalCodec(newCodec);
			}

			setDefaultOutName({type: 'render', codec: newCodec});
		},
		[renderMode, setDefaultOutName]
	);

	const setStillFormat = useCallback(
		(format: StillImageFormat) => {
			setStillImageFormat(format);
			setDefaultOutName({type: 'still', imageFormat: format});
		},
		[setDefaultOutName]
	);

	const onClickStill = useCallback(() => {
		leftSidebarTabs.current?.selectRendersPanel();
		dispatchIfMounted({type: 'start'});
		addStillRenderJob({
			compositionId,
			outName,
			imageFormat: stillImageFormat,
			quality: stillImageFormat === 'jpeg' ? quality : null,
			frame,
			scale,
			verbose,
		})
			.then(() => {
				dispatchIfMounted({type: 'succeed'});
				setSelectedModal(null);
			})
			.catch(() => {
				dispatchIfMounted({type: 'fail'});
			});
	}, [
		compositionId,
		dispatchIfMounted,
		frame,
		stillImageFormat,
		outName,
		quality,
		scale,
		setSelectedModal,
		verbose,
	]);

	const onClickVideo = useCallback(() => {
		leftSidebarTabs.current?.selectRendersPanel();
		dispatchIfMounted({type: 'start'});
		addVideoRenderJob({
			compositionId,
			outName,
			imageFormat: videoImageFormat,
			quality: stillImageFormat === 'jpeg' ? quality : null,
			scale,
			verbose,
			codec,
			concurrency,
			crf,
			endFrame,
			startFrame,
		})
			.then(() => {
				dispatchIfMounted({type: 'succeed'});
				setSelectedModal(null);
			})
			.catch(() => {
				dispatchIfMounted({type: 'fail'});
			});
	}, [
		dispatchIfMounted,
		compositionId,
		outName,
		videoImageFormat,
		stillImageFormat,
		quality,
		scale,
		verbose,
		codec,
		concurrency,
		crf,
		endFrame,
		startFrame,
		setSelectedModal,
	]);

	const onConcurrencyChangedDirectly = useCallback((newConcurrency: number) => {
		setConcurrency(newConcurrency);
	}, []);

	const onConcurrencyChanged = useCallback(
		(e: string) => {
			setConcurrency((q) => {
				const newConcurrency = parseInt(e, 10);
				if (Number.isNaN(newConcurrency)) {
					return q;
				}

				const newConcurrencyClamped = Math.min(
					maxConcurrency,
					Math.max(newConcurrency, minConcurrency)
				);
				return newConcurrencyClamped;
			});
		},
		[maxConcurrency, minConcurrency]
	);

	const onFrameSetDirectly = useCallback(
		(newFrame: number) => {
			setFrame(newFrame);
		},
		[setFrame]
	);

	const onFrameChanged = useCallback((e: string) => {
		setFrame((q) => {
			const newFrame = parseFloat(e);
			if (Number.isNaN(newFrame)) {
				return q;
			}

			return newFrame;
		});
	}, []);

	useEffect(() => {
		return () => {
			isMounted.current = false;
		};
	}, []);

	const existence = useFileExistence(outName);

	const imageFormatOptions = useMemo((): SegmentedControlItem[] => {
		return [
			{
				label: 'PNG',
				onClick:
					renderMode === 'still'
						? () => setStillFormat('png')
						: () => setVideoImageFormat('png'),
				key: 'png',
				selected:
					renderMode === 'still'
						? stillImageFormat === 'png'
						: videoImageFormat === 'png',
			},
			{
				label: 'JPEG',
				onClick:
					renderMode === 'still'
						? () => setStillFormat('jpeg')
						: () => setVideoImageFormat('jpeg'),
				key: 'jpeg',
				selected:
					renderMode === 'still'
						? stillImageFormat === 'jpeg'
						: videoImageFormat === 'jpeg',
			},
		];
	}, [stillImageFormat, renderMode, setStillFormat, videoImageFormat]);

	const videoCodecOptions = useMemo((): SegmentedControlItem[] => {
		return BrowserSafeApis.validCodecs
			.filter((c) => {
				return BrowserSafeApis.isAudioCodec(c) === (renderMode === 'audio');
			})
			.map((codecOption) => {
				return {
					label: codecOption,
					onClick: () => setCodec(codecOption),
					key: codecOption,
					selected: codec === codecOption,
				};
			});
	}, [renderMode, setCodec, codec]);

	const setRenderMode = useCallback(
		(newRenderMode: RenderType) => {
			setRenderModeState(newRenderMode);
			if (newRenderMode === 'audio') {
				setDefaultOutName({type: 'render', codec: audioCodec});
			}

			if (newRenderMode === 'video') {
				setDefaultOutName({type: 'render', codec: videoCodec});
			}

			if (newRenderMode === 'still') {
				setDefaultOutName({type: 'still', imageFormat: stillImageFormat});
			}
		},
		[audioCodec, setDefaultOutName, stillImageFormat, videoCodec]
	);

	const renderTabOptions = useMemo((): SegmentedControlItem[] => {
		if (currentComposition?.durationInFrames < 2) {
			return [
				{
					label: 'Still',
					onClick: () => {
						setRenderMode('still');
					},
					key: 'still',
					selected: renderMode === 'still',
				},
			];
		}

		return [
			{
				label: 'Still',
				onClick: () => {
					setRenderMode('still');
				},
				key: 'still',
				selected: renderMode === 'still',
			},
			{
				label: 'Video',
				onClick: () => {
					setRenderMode('video');
				},
				key: 'video',
				selected: renderMode === 'video',
			},
			{
				label: 'Audio',
				onClick: () => {
					setRenderMode('audio');
				},
				key: 'audio',
				selected: renderMode === 'audio',
			},
		];
	}, [currentComposition?.durationInFrames, renderMode, setRenderMode]);

	const onVerboseLoggingChanged = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			setVerboseLogging(e.target.checked);
		},
		[]
	);

	if (renderMode === 'still') {
		return (
			<ModalContainer onOutsideClick={onQuit} onEscape={onQuit}>
				<NewCompHeader title={`Render ${compositionId}`} />
				<div style={container}>
					<SegmentedControl items={renderTabOptions} needsWrapping={false} />
				</div>
				<div>
					<Spacing block y={0.5} />
					<div style={optionRow}>
						<div style={label}>Format</div>
						<div style={rightRow}>
							<SegmentedControl items={imageFormatOptions} needsWrapping />
						</div>
					</div>
					<div style={optionRow}>
						<div style={label}>Output name</div>
						<div style={rightRow}>
							<div>
								<RemotionInput
									// TODO: Validate and reject folders or weird file names
									warning={existence}
									style={input}
									type="text"
									value={outName}
									onChange={onValueChange}
								/>
								{existence ? (
									<ValidationMessage
										align="flex-end"
										message="Will be overwritten"
									/>
								) : null}
							</div>
						</div>
					</div>
					{currentComposition.durationInFrames > 1 ? (
						<div style={optionRow}>
							<div style={label}>Frame</div>
							<div style={rightRow}>
								<RightAlignInput>
									<InputDragger
										value={frame}
										onTextChange={onFrameChanged}
										placeholder={`0-${currentComposition.durationInFrames - 1}`}
										onValueChange={onFrameSetDirectly}
										name="frame"
										step={1}
										min={0}
										max={currentComposition.durationInFrames - 1}
									/>
								</RightAlignInput>
							</div>
						</div>
					) : null}

					<CollapsableOptions
						showLabel="Show advanced settings"
						hideLabel="Hide advanced settings"
					>
						<ScaleSetting scale={scale} setScale={setScale} />
						<div style={optionRow}>
							<div style={label}>Verbose logging</div>
							<div style={rightRow}>
								<Checkbox
									checked={verbose}
									onChange={onVerboseLoggingChanged}
								/>
							</div>
						</div>
						{stillImageFormat === 'jpeg' && (
							<QualitySetting setQuality={setQuality} quality={quality} />
						)}
					</CollapsableOptions>
					<Spacing block y={0.5} />
					<div style={buttonRow}>
						<Button
							autoFocus
							onClick={onClickStill}
							disabled={state.type === 'load'}
						>
							{state.type === 'idle' ? 'Render still' : 'Rendering...'}
						</Button>
					</div>
				</div>
			</ModalContainer>
		);
	}

	return (
		<ModalContainer onOutsideClick={onQuit} onEscape={onQuit}>
			<NewCompHeader title={`Render ${compositionId}`} />
			<div style={container}>
				<SegmentedControl items={renderTabOptions} needsWrapping={false} />
			</div>
			<div>
				<Spacing block y={0.5} />
				<div style={optionRow}>
					<div style={label}>Codec</div>
					<div style={rightRow}>
						<SegmentedControl items={videoCodecOptions} needsWrapping />
					</div>
				</div>
				<div style={optionRow}>
					<div style={label}>Output name</div>
					<div style={rightRow}>
						<div>
							<RemotionInput
								// TODO: Validate and reject folders or weird file names
								warning={existence}
								style={input}
								type="text"
								value={outName}
								onChange={onValueChange}
							/>
							{existence ? (
								<ValidationMessage
									align="flex-end"
									message="Will be overwritten"
								/>
							) : null}
						</div>
					</div>
				</div>
				<CollapsableOptions
					showLabel="Show advanced settings"
					hideLabel="Hide advanced settings"
				>
					<div style={optionRow}>
						<div style={label}>Concurrency</div>
						<div style={rightRow}>
							<RightAlignInput>
								<InputDragger
									value={concurrency}
									onTextChange={onConcurrencyChanged}
									placeholder={`${minConcurrency}-${maxConcurrency}`}
									onValueChange={onConcurrencyChangedDirectly}
									name="concurrency"
									step={1}
									min={minConcurrency}
									max={maxConcurrency}
								/>
							</RightAlignInput>
						</div>
					</div>
					{renderMode === 'video' ? (
						<ScaleSetting scale={scale} setScale={setScale} />
					) : null}
					{renderMode === 'video' ? (
						<div style={optionRow}>
							<div style={label}>Image Format</div>
							<div style={rightRow}>
								<SegmentedControl
									items={imageFormatOptions}
									needsWrapping={false}
								/>
							</div>
						</div>
					) : null}
					{renderMode === 'video' && videoImageFormat === 'jpeg' && (
						<QualitySetting setQuality={setQuality} quality={quality} />
					)}
					{shouldDisplayOption ? (
						<CrfSetting crf={crf} max={maxCrf} min={minCrf} setCrf={setCrf} />
					) : null}
					<FrameRangeSetting
						durationInFrames={currentComposition.durationInFrames}
						endFrame={endFrame}
						setEndFrame={setEndFrame}
						setStartFrame={setStartFrame}
						startFrame={startFrame}
					/>
					<div style={optionRow}>
						<div style={label}>Verbose logging</div>
						<div style={rightRow}>
							<Checkbox checked={verbose} onChange={onVerboseLoggingChanged} />
						</div>
					</div>
				</CollapsableOptions>
				<Spacing block y={0.5} />
				<div style={buttonRow}>
					<Button
						autoFocus
						onClick={onClickVideo}
						disabled={state.type === 'load'}
					>
						{state.type === 'idle'
							? 'Render ' + (renderMode === 'audio' ? 'audio' : 'video')
							: 'Rendering...'}
					</Button>
				</div>
			</div>
		</ModalContainer>
	);
};