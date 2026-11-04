import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import {
  BoltIcon,
  BoxIcon,
  EuroIcon,
  FilePlus2Icon,
  FileSearchIcon,
  HistoryIcon,
  KeyboardMusicIcon,
  PackagePlusIcon,
  PaintBucketIcon,
  PencilIcon,
  WalletIcon,
} from "lucide-react";
import type { ReactElement } from "react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "@/components/ui/header";
import { UserMode, useAppContext } from "@/contexts/app-context";
import { PARTS_LABEL } from "@/messages/common";
import { DELIVERY_NOTES_LABEL } from "@/messages/delivery-note";
import {
  ADMINISTRATION_LABEL,
  MAINTENANCE_LABEL,
  PRICE_CALCULATOR_LABEL,
  SELL_ORDER_LIST_LABEL,
  SERVE_PARTS_LABEL,
  SUBMIT_SELL_ORDER_LABEL,
} from "@/messages/home";
import { INVOICING_LABEL } from "@/messages/invoice";
import { PRODUCTION_HISTORY_TITLE, PRODUCTION_LABEL, PRODUCTION_ORDERS_LABEL } from "@/messages/production-order";
import { SELL_ORDERS_LABEL } from "@/messages/sell-order";
import { TREATMENT_LABEL } from "@/messages/treatment";

class CardGroup {
  constructor(
    public title: string,
    public userModes: Array<UserMode>,
    public cards: Array<CardData>,
  ) {}
}

class CardData {
  constructor(
    public title: string | ReactElement,
    public icon: ReactElement,
    public link: LinkProps["to"],
    public userModes: Array<UserMode> = [UserMode.Admin, UserMode.User],
  ) {}
}

export default function NavigationGrid() {
  const { userMode } = useAppContext();

  const iconStyle = "size-12 self-center";

  const cardGroups = [
    new CardGroup(
      PRODUCTION_LABEL,
      [UserMode.Machine, UserMode.User, UserMode.Admin],
      [
        new CardData(
          PRODUCTION_LABEL,
          <BoltIcon className={iconStyle} /> /* eslint-disable-line react/jsx-key */,
          "/production",
          [UserMode.Machine],
        ),
        new CardData(
          PRODUCTION_HISTORY_TITLE,
          <HistoryIcon className={iconStyle} /> /* eslint-disable-line react/jsx-key */,
          "/production-history",
          [UserMode.Machine],
        ),
        new CardData(
          PRODUCTION_ORDERS_LABEL,
          <KeyboardMusicIcon className={iconStyle} /> /* eslint-disable-line react/jsx-key */,
          "/production-order",
          [UserMode.Machine, UserMode.User, UserMode.Admin],
        ),
        new CardData(
          TREATMENT_LABEL,
          <PaintBucketIcon className={iconStyle} /> /* eslint-disable-line react/jsx-key */,
          "/treatment",
          [UserMode.Machine, UserMode.User, UserMode.Admin],
        ),
        new CardData(PARTS_LABEL, <BoxIcon className={iconStyle} /> /* eslint-disable-line react/jsx-key */, "/part", [
          UserMode.Machine,
          UserMode.User,
          UserMode.Admin,
        ]),
      ],
    ),
    new CardGroup(
      SELL_ORDERS_LABEL,
      [UserMode.Admin],
      [
        new CardData(
          SUBMIT_SELL_ORDER_LABEL,
          <FilePlus2Icon className={iconStyle} /> /* eslint-disable-line react/jsx-key */,
          "/create-sell-order",
        ),
        new CardData(
          SELL_ORDER_LIST_LABEL,
          <FileSearchIcon className={iconStyle} /> /* eslint-disable-line react/jsx-key */,
          "/sell-order",
        ),
      ],
    ),
    new CardGroup(
      DELIVERY_NOTES_LABEL,
      [UserMode.Machine, UserMode.User, UserMode.Admin],
      [
        new CardData(
          SERVE_PARTS_LABEL,
          <PackagePlusIcon className={iconStyle} /> /* eslint-disable-line react/jsx-key */,
          "/create-delivery-note",
        ),
        new CardData(
          DELIVERY_NOTES_LABEL,
          <FileSearchIcon className={iconStyle} /> /* eslint-disable-line react/jsx-key */,
          "/delivery-note",
          [UserMode.Machine, UserMode.User, UserMode.Admin],
        ),
      ],
    ),
    new CardGroup(
      ADMINISTRATION_LABEL,
      [UserMode.Admin],
      [
        new CardData(
          PRICE_CALCULATOR_LABEL,
          <EuroIcon className={iconStyle} /> /* eslint-disable-line react/jsx-key */,
          "/price-calculator",
        ),
        new CardData(
          INVOICING_LABEL,
          <WalletIcon className={iconStyle} /> /* eslint-disable-line react/jsx-key */,
          "/invoicing",
        ),
        new CardData(
          MAINTENANCE_LABEL,
          <PencilIcon className={iconStyle} /> /* eslint-disable-line react/jsx-key */,
          "/maintenance",
        ),
      ],
    ),
  ];

  if (userMode === undefined) {
    return null;
  }

  return (
    <div className="mx-auto flex flex-col gap-3">
      {cardGroups
        .filter((cardGroup) => cardGroup.userModes.includes(userMode))
        .map((cardGroup) => {
          const filteredCards = cardGroup.cards.filter((card) => card.userModes.includes(userMode));
          return new CardGroup(cardGroup.title, cardGroup.userModes, filteredCards);
        })
        .filter((group) => group.cards.length > 0)
        .map((group, groupIndex) => (
          <div key={groupIndex} className="flex flex-col items-center gap-3">
            <Header>{group.title}</Header>
            <div className="flex w-fit flex-wrap gap-3">
              {group.cards.map((card, cardIndex) => (
                <Link to={card.link} key={cardIndex}>
                  <Card variant="primary" className="w-60 transition-transform hover:scale-105 hover:bg-primary/90">
                    <CardHeader>
                      <CardTitle className="justify-center text-nowrap whitespace-nowrap">{card.title}</CardTitle>
                    </CardHeader>
                    {card.icon}
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
