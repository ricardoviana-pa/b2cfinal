/* ==========================================================================
   EXPERIENCE GUIDE PROFILE — host/guide profile card
   Left-aligned photo/avatar + right side with name, role, description, languages
   Clean editorial style with subtle taupe border-left
   ========================================================================== */

interface ExperienceGuideProfileProps {
  guideName: string;
  guideRole: string;
  guideDescription: string;
  guideLanguages: string[];
  guidePhoto?: string;
}

export default function ExperienceGuideProfile({
  guideName,
  guideRole,
  guideDescription,
  guideLanguages,
  guidePhoto,
}: ExperienceGuideProfileProps) {
  // Create initials avatar if no photo
  // Filter out non-alpha tokens like "&" before extracting initials
  const initials = guideName
    .split(/\s+/)
    .filter(n => /^[a-zA-ZÀ-ÿ]/.test(n))
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="border-l-[2.5px] border-[#8B7355] pl-8 py-2">
      <div className="flex flex-col md:flex-row gap-8 md:gap-10">
        {/* Photo / Avatar */}
        <div className="shrink-0">
          {guidePhoto ? (
            <img
              src={guidePhoto}
              alt={guideName}
              className="w-32 h-32 md:w-40 md:h-40 object-cover bg-[#F5F1EB] border border-[#E8E4DC]"
            />
          ) : (
            <div className="w-32 h-32 md:w-40 md:h-40 flex items-center justify-center bg-[#F5F1EB] border border-[#E8E4DC]">
              <span className="text-[32px] font-display text-[#8B7355]">
                {initials}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-start">
          {/* Name */}
          <h3 className="text-[22px] md:text-[26px] font-display text-[#1A1A18] mb-1 leading-tight">
            {guideName}
          </h3>

          {/* Role */}
          <p className="text-[10px] tracking-[0.08em] uppercase text-[#8B7355] font-medium mb-5">
            {guideRole}
          </p>

          {/* Description */}
          <p className="text-[14px] text-[#6B6860] leading-relaxed mb-6" style={{ fontWeight: 300 }}>
            {guideDescription}
          </p>

          {/* Languages */}
          {guideLanguages.length > 0 && (
            <div>
              <p className="text-[10px] tracking-[0.08em] uppercase text-[#9E9A90] font-medium mb-2">
                Languages
              </p>
              <div className="flex flex-wrap gap-2">
                {guideLanguages.map((lang, idx) => (
                  <span
                    key={idx}
                    className="inline-block text-[12px] text-[#6B6860] bg-[#F5F1EB] px-3 py-1.5 border border-[#E8E4DC]"
                    style={{ fontWeight: 300 }}
                  >
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
