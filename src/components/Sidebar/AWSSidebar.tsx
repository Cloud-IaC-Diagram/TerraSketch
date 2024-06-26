import React, {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    forwardRef,
    useImperativeHandle,
    useCallback,
    RefObject,
} from "react";
import { Island } from ".././Island";
import { atom, useSetAtom } from "jotai";
import { jotaiScope } from "../../jotai";
import {
    SidebarPropsContext,
    SidebarProps,
    SidebarPropsContextValue,
} from "./common";
import { SidebarHeader } from "./SidebarHeader";
import clsx from "clsx";
import { useDevice, useExcalidrawSetAppState } from "../App";
import { updateObject } from "../../utils";
import { KEYS } from "../../keys";
import { EVENT } from "../../constants";
import { SidebarTrigger } from "./SidebarTrigger";
import { SidebarTabTriggers } from "./SidebarTabTriggers";
import { SidebarTabTrigger } from "./SidebarTabTrigger";
import { SidebarTabs } from "./SidebarTabs";
import { SidebarTab } from "./SidebarTab";

import "./AWSSidebar.scss";
import { useUIAppState } from "../../context/ui-appState";
import { useAtom } from "jotai"; //230803


// FIXME replace this with the implem from ColorPicker once it's merged
const useOnClickOutside = (
    ref: RefObject<HTMLElement>,
    cb: (event: MouseEvent) => void,
) => {
    useEffect(() => {
        const listener = (event: MouseEvent) => {
            if (!ref.current) {
                return;
            }

            if (
                event.target instanceof Element &&
                (ref.current.contains(event.target) ||
                    !document.body.contains(event.target))
            ) {
                return;
            }

            cb(event);
        };
        document.addEventListener("pointerdown", listener, false);

        return () => {
            document.removeEventListener("pointerdown", listener);
        };
    }, [ref, cb]);
};

/**
 * Flags whether the currently rendered Sidebar is docked or not, for use
 * in upstream components that need to act on this (e.g. LayerUI to shift the
 * UI). We use an atom because of potential host app sidebars (for the default
 * sidebar we could just read from appState.defaultSidebarDockedPreference).
 *
 * Since we can only render one Sidebar at a time, we can use a simple flag.
 */
export const isAWSLibSidebarDockedAtom = atom(false);

export const AWSSidebarInner = forwardRef(
    (
        {
            name,
            children,
            onDock,
            docked,
            className,
            ...rest
        }: SidebarProps & Omit<React.RefAttributes<HTMLDivElement>, "onSelect">,
        ref: React.ForwardedRef<HTMLDivElement>,
    ) => {
        if (process.env.NODE_ENV === "development" && onDock && docked == null) {
            console.warn(
                "AWSSidebar: `docked` must be set when `onDock` is supplied for the sidebar to be user-dockable. To hide this message, either pass `docked` or remove `onDock`",
            );
        }

        const setAppState = useExcalidrawSetAppState();

        const setisAWSLibSidebarDockedAtom = useSetAtom(isAWSLibSidebarDockedAtom, jotaiScope);

        useLayoutEffect(() => {
            setisAWSLibSidebarDockedAtom(!!docked);
            return () => {
                setisAWSLibSidebarDockedAtom(false);
            };
        }, [setisAWSLibSidebarDockedAtom, docked]);

        const headerPropsRef = useRef<SidebarPropsContextValue>(
            {} as SidebarPropsContextValue,
        );
        headerPropsRef.current.onCloseRequest = () => {
            setAppState({ openSidebar: null });
        };
        headerPropsRef.current.onDock = (isDocked) => onDock?.(isDocked);
        // renew the ref object if the following props change since we want to
        // rerender. We can't pass down as component props manually because
        // the <AWSSidebar.Header/> can be rendered upstream.
        headerPropsRef.current = updateObject(headerPropsRef.current, {
            docked,
            // explicit prop to rerender on update
            shouldRenderDockButton: !!onDock && docked != null,
        });

        const islandRef = useRef<HTMLDivElement>(null);

        useImperativeHandle(ref, () => {
            return islandRef.current!;
        });

        const device = useDevice();

        const closeLibrary = useCallback(() => {
            const isDialogOpen = !!document.querySelector(".Dialog");

            // Prevent closing if any dialog is open
            if (isDialogOpen) {
                return;
            }
            setAppState({ openSidebar: null });
        }, [setAppState]);

        useOnClickOutside( //사이드바 외부 클릭 시 사이드바 닫기
            islandRef,
            useCallback(
                (event) => {
                    // If click on the library icon, do nothing so that LibraryButton
                    // can toggle library menu
                    if ((event.target as Element).closest(".sidebar-trigger")) {
                        return;
                    }
                    if (!docked || !device.canDeviceFitSidebar) {
                        //closeLibrary(); 이부분 삭제(사이드바 외부 클릭 시 닫기는 효과 제거)
                    }
                },
                [closeLibrary, docked, device.canDeviceFitSidebar],
            ),
        );

        useEffect(() => {
            const handleKeyDown = (event: KeyboardEvent) => {
                if (
                    event.key === KEYS.ESCAPE &&
                    (!docked || !device.canDeviceFitSidebar)
                ) {
                    closeLibrary();
                }
            };
            document.addEventListener(EVENT.KEYDOWN, handleKeyDown);
            return () => {
                document.removeEventListener(EVENT.KEYDOWN, handleKeyDown);
            };
        }, [closeLibrary, docked, device.canDeviceFitSidebar]);

        return (
            <Island
                {...rest}
                className={clsx("awssidebar", { "sidebar--docked": docked }, className)}
                ref={islandRef}
            >
                <SidebarPropsContext.Provider value={headerPropsRef.current}>
                    {children}
                </SidebarPropsContext.Provider>
            </Island>
        );
    },
);
AWSSidebarInner.displayName = "AWSSidebarInner";

export const AWSSidebar = Object.assign(
    forwardRef((props: SidebarProps, ref: React.ForwardedRef<HTMLDivElement>) => {
        const appState = useUIAppState();

        const { onStateChange } = props;

        const refPrevOpenSidebar = useRef(appState.openSidebar);
        useEffect(() => {
            if (
                // closing sidebar
                ((!appState.openSidebar &&
                    refPrevOpenSidebar?.current?.name === props.name) ||
                    // opening current sidebar
                    (appState.openSidebar?.name === props.name &&
                        refPrevOpenSidebar?.current?.name !== props.name) ||
                    // switching tabs or switching to a different sidebar
                    refPrevOpenSidebar.current?.name === props.name) &&
                appState.openSidebar !== refPrevOpenSidebar.current
            ) {
                onStateChange?.(
                    appState.openSidebar?.name !== props.name
                        ? null
                        : appState.openSidebar,
                );
            }
            refPrevOpenSidebar.current = appState.openSidebar;
        }, [appState.openSidebar, onStateChange, props.name]);

        const [mounted, setMounted] = useState(false);
        useLayoutEffect(() => {
            setMounted(true);
            return () => setMounted(false);
        }, []);

        // We want to render in the next tick (hence `mounted` flag) so that it's
        // guaranteed to happen after unmount of the previous sidebar (in case the
        // previous sidebar is mounted after the next one). This is necessary to
        // prevent flicker of subcomponents that support fallbacks
        // (e.g. SidebarHeader). This is because we're using flags to determine
        // whether prefer the fallback component or not (otherwise both will render
        // initially), and the flag won't be reset in time if the unmount order
        // it not correct.
        //
        // Alternative, and more general solution would be to namespace the fallback
        // HoC so that state is not shared between subcomponents when the wrapping
        // component is of the same type (e.g. Sidebar -> SidebarHeader).
        const shouldRender = mounted && appState.openSidebar?.name === props.name;

        //230803
        /*const [isAWSLibSidebarDocked] = useAtom(isAWSLibSidebarDockedAtom);
        const shouldRender =
        mounted &&
        appState.openSidebar?.name === props.name &&
        isAWSLibSidebarDocked;*/

        if (!shouldRender) {
            return null;
        }

        return <AWSSidebarInner {...props} ref={ref} key={props.name} />;
    }),
    {
        Header: SidebarHeader,
        TabTriggers: SidebarTabTriggers,
        TabTrigger: SidebarTabTrigger,
        Tabs: SidebarTabs,
        Tab: SidebarTab,
        Trigger: SidebarTrigger,
    },
);
AWSSidebar.displayName = "AWSSidebar";
