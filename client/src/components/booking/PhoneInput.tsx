import { PhoneInput as RIPPhoneInput } from "react-international-phone";
import "react-international-phone/style.css";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function PhoneInput({ value, onChange, placeholder = "Phone number *", className }: PhoneInputProps) {
  return (
    <div className={className}>
      <RIPPhoneInput
        defaultCountry="pt"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputProps={{ autoComplete: 'tel', inputMode: 'tel' }}
        inputClassName="!w-full !h-full !bg-white !border-0 !border-r-0 !rounded-none !rounded-r-md !text-[16px] !text-[#1A1A18] !px-3 focus:!outline-none focus:!ring-0 !font-[inherit]"
        countrySelectorStyleProps={{
          buttonClassName: "!bg-white !border-0 !rounded-none !rounded-l-md !px-3 !h-full hover:!bg-[#F5F1EB] !transition-colors",
          dropdownStyleProps: {
            className: "!bg-white !border-[#E8E4DC] !rounded-lg !shadow-lg !z-[100] !max-h-[200px]",
            listItemClassName: "!text-[13px] !text-[#1A1A18] hover:!bg-[#F5F1EB] !px-3 !py-2",
          },
        }}
        className="!flex !items-center !w-full !h-[52px] !bg-white !border !border-[#E8E4DC] !rounded-md focus-within:!border-[#8B7355] focus-within:!ring-2 focus-within:!ring-[#8B7355] !transition"
        style={{ height: "52px" }}
      />
    </div>
  );
}
